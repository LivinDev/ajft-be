import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { 
  CreateInternshipDto, 
  UpdateInternshipDto, 
  InternshipResponseDto,
  GenerateCertificateDto,
  CertificateFormat 
} from './dto';

@Injectable()
export class InternshipsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService
  ) {}

  // Admin creates internship for a user
  async createInternship(createInternshipDto: CreateInternshipDto): Promise<InternshipResponseDto> {
    const { userId, title, role, startDate, endDate, description, status } = createInternshipDto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      throw new BadRequestException('End date must be after start date');
    }

    // Create internship
    const internship = await this.prisma.internship.create({
      data: {
        userId,
        title,
        role,
        startDate: start,
        endDate: end,
        description,
        status: status || 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Send internship assignment email
    try {
      await this.emailService.sendInternshipAssignmentEmail(
        user.email,
        user.name || 'User',
        {
          title: internship.title,
          role: internship.role,
          startDate: internship.startDate.toDateString(),
          endDate: internship.endDate.toDateString(),
          duration: this.calculateDuration(internship.startDate, internship.endDate),
          description: internship.description || 'No description provided'
        }
      );
    } catch (error) {
      console.error('Failed to send internship assignment email:', error);
    }

    return this.mapToResponseDto(internship);
  }

  // Get all internships (Admin only)
  async getAllInternships(): Promise<InternshipResponseDto[]> {
    const internships = await this.prisma.internship.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return internships.map(this.mapToResponseDto);
  }

  // Get internships by user ID with dashboard info
  async getInternshipsByUserId(userId: string): Promise<any[]> {
    const internships = await this.prisma.internship.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return internships.map(internship => {
      const mapped = this.mapToResponseDto(internship);
      const today = new Date();
      
      if (internship.status === 'ACTIVE') {
        const daysLeft = Math.ceil((internship.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...mapped,
          daysLeft: daysLeft > 0 ? daysLeft : 0,
          isOverdue: daysLeft < 0,
          progress: this.calculateProgress(internship.startDate, internship.endDate, today)
        };
      }
      
      return mapped;
    });
  }

  // Get specific internship
  async getInternshipById(id: string): Promise<InternshipResponseDto> {
    const internship = await this.prisma.internship.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found');
    }

    return this.mapToResponseDto(internship);
  }

  // Update internship
  async updateInternship(id: string, updateInternshipDto: UpdateInternshipDto): Promise<InternshipResponseDto> {
    const internship = await this.prisma.internship.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found');
    }

    // Validate dates if provided
    if (updateInternshipDto.startDate && updateInternshipDto.endDate) {
      const start = new Date(updateInternshipDto.startDate);
      const end = new Date(updateInternshipDto.endDate);
      
      if (start >= end) {
        throw new BadRequestException('End date must be after start date');
      }
    }

    const updatedInternship = await this.prisma.internship.update({
      where: { id },
      data: {
        ...updateInternshipDto,
        startDate: updateInternshipDto.startDate ? new Date(updateInternshipDto.startDate) : undefined,
        endDate: updateInternshipDto.endDate ? new Date(updateInternshipDto.endDate) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // If status changed to COMPLETED, send completion email with certificate
    if (updateInternshipDto.status === 'COMPLETED' && internship.status !== 'COMPLETED') {
      try {
        const certificateData = await this.getCertificateData(id);
        const certificateHTML = this.generateCertificateHTML(certificateData);
        
        await this.emailService.sendInternshipCompletionEmail(
          internship.user.email,
          internship.user.name || 'User',
          {
            title: updatedInternship.title,
            role: updatedInternship.role,
            duration: this.calculateDuration(updatedInternship.startDate, updatedInternship.endDate),
            completionDate: new Date().toDateString()
          },
          certificateHTML
        );
      } catch (error) {
        console.error('Failed to send internship completion email:', error);
      }
    }

    return this.mapToResponseDto(updatedInternship);
  }

  // Delete internship
  async deleteInternship(id: string): Promise<{ message: string }> {
    const internship = await this.prisma.internship.findUnique({
      where: { id },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found');
    }

    await this.prisma.internship.delete({
      where: { id },
    });

    return { message: 'Internship deleted successfully' };
  }

  // Get user dashboard data
  async getUserDashboard(userId: string): Promise<any> {
    const internships = await this.getInternshipsByUserId(userId);
    
    const stats = {
      total: internships.length,
      active: internships.filter(i => i.status === 'ACTIVE').length,
      completed: internships.filter(i => i.status === 'COMPLETED').length,
      cancelled: internships.filter(i => i.status === 'CANCELLED').length,
    };

    const activeInternships = internships.filter(i => i.status === 'ACTIVE');
    const completedInternships = internships.filter(i => i.status === 'COMPLETED');

    return {
      stats,
      activeInternships,
      completedInternships,
      recentActivity: internships.slice(0, 5), // Last 5 internships
    };
  }

  // Get certificate data for frontend generation
  async getCertificateData(internshipId: string): Promise<any> {
    const internship = await this.prisma.internship.findUnique({
      where: { id: internshipId },
      include: {
        user: true,
      },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found');
    }

    return {
      userName: internship.user.name || internship.user.email,
      internshipTitle: internship.title,
      role: internship.role,
      startDate: internship.startDate.toDateString(),
      endDate: internship.endDate.toDateString(),
      duration: this.calculateDuration(internship.startDate, internship.endDate),
      issueDate: new Date().toDateString(),
      certificateId: `CERT-${internshipId.slice(-8).toUpperCase()}`,
    };
  }

  // Generate certificate HTML template
  generateCertificateHTML(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Certificate - ${data.userName}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Georgia', serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .certificate {
            background: white;
            border: 15px solid #f8f9fa;
            border-radius: 20px;
            padding: 60px;
            text-align: center;
            box-shadow: 0 0 50px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 900px;
            position: relative;
          }
          
          .header {
            color: #2c3e50;
            font-size: 48px;
            font-weight: bold;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 3px;
          }
          
          .subheader {
            color: #7f8c8d;
            font-size: 24px;
            margin-bottom: 40px;
          }
          
          .recipient {
            font-size: 42px;
            color: #e74c3c;
            font-weight: bold;
            margin: 30px 0;
            text-decoration: underline;
            text-decoration-color: #3498db;
          }
          
          .content {
            font-size: 24px;
            line-height: 1.8;
            margin: 40px 0;
            color: #2c3e50;
          }
          
          .details {
            background: #ecf0f1;
            padding: 30px;
            border-radius: 10px;
            margin: 40px 0;
            font-size: 20px;
            text-align: left;
          }
          
          .details strong {
            color: #2c3e50;
          }
          
          .signature-section {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            align-items: end;
            flex-wrap: wrap;
            gap: 20px;
          }
          
          .signature {
            text-align: center;
            min-width: 200px;
          }
          
          .sig-line {
            width: 200px;
            border-bottom: 2px solid #333;
            margin-bottom: 10px;
          }
          
          .signature-title {
            font-size: 16px;
            font-weight: bold;
            color: #2c3e50;
          }
          
          .date-section {
            text-align: center;
            font-style: italic;
            color: #7f8c8d;
            font-size: 18px;
          }
          
          .certificate-id {
            position: absolute;
            top: 20px;
            right: 30px;
            font-size: 12px;
            color: #95a5a6;
            font-family: 'Courier New', monospace;
          }
          
          .organization-logo {
            position: absolute;
            top: 20px;
            left: 30px;
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
          }
          
          @media print {
            body {
              padding: 0;
              background: white;
            }
            .certificate {
              box-shadow: none;
              border: 3px solid #2c3e50;
            }
          }
          
          @media screen and (max-width: 768px) {
            body {
              padding: 20px;
            }
            .certificate {
              padding: 40px 30px;
            }
            .header {
              font-size: 36px;
            }
            .recipient {
              font-size: 32px;
            }
            .content {
              font-size: 20px;
            }
            .details {
              font-size: 18px;
              padding: 20px;
            }
            .signature-section {
              flex-direction: column;
              gap: 30px;
            }
          }
        </style>
      </head>
      <body>
        <div class="certificate">
          <div class="organization-logo">Kyro Learn</div>
          <div class="certificate-id">ID: ${data.certificateId}</div>
          
          <div class="header">Certificate of Completion</div>
          <div class="subheader">This is to certify that</div>
          <div class="recipient">${data.userName}</div>
          <div class="content">
            has successfully completed the internship program
          </div>
          
          <div class="details">
            <div style="margin-bottom: 15px;"><strong>Program:</strong> ${data.internshipTitle}</div>
            <div style="margin-bottom: 15px;"><strong>Role:</strong> ${data.role}</div>
            <div style="margin-bottom: 15px;"><strong>Duration:</strong> ${data.startDate} to ${data.endDate}</div>
            <div><strong>Period:</strong> ${data.duration}</div>
          </div>
          
          <div class="content">
            and has demonstrated exceptional performance and dedication throughout the program.
          </div>
          
          <div class="signature-section">
            <div class="signature">
              <div class="sig-line"></div>
              <div class="signature-title">Program Director</div>
            </div>
            
            <div class="date-section">
              <div>Issued on:</div>
              <div style="font-weight: bold; color: #2c3e50;">${data.issueDate}</div>
            </div>
            
            <div class="signature">
              <div class="sig-line"></div>
              <div class="signature-title">Kyro Learn</div>
            </div>
          </div>
        </div>
        
        <script>
          function downloadAsPDF() {
            window.print();
          }
          
          document.addEventListener('DOMContentLoaded', function() {
            const downloadBtn = document.createElement('button');
            downloadBtn.innerHTML = 'Download as PDF';
            downloadBtn.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000; background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;';
            downloadBtn.onclick = downloadAsPDF;
            document.body.appendChild(downloadBtn);
            
            window.addEventListener('beforeprint', function() {
              downloadBtn.style.display = 'none';
            });
            
            window.addEventListener('afterprint', function() {
              downloadBtn.style.display = 'block';
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  // Calculate duration between dates
  private calculateDuration(startDate: Date, endDate: Date): string {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) {
      return `${diffDays} days`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)} weeks`;
    } else {
      return `${Math.floor(diffDays / 30)} months`;
    }
  }

  // Calculate progress percentage
  private calculateProgress(startDate: Date, endDate: Date, currentDate: Date): number {
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = currentDate.getTime() - startDate.getTime();
    const progress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
    return Math.round(progress);
  }

  // Helper method to map to response DTO
  private mapToResponseDto(internship: any): InternshipResponseDto {
    return {
      id: internship.id,
      title: internship.title,
      role: internship.role,
      startDate: internship.startDate,
      endDate: internship.endDate,
      description: internship.description,
      status: internship.status,
      certificateUrl: internship.certificateUrl,
      createdAt: internship.createdAt,
      updatedAt: internship.updatedAt,
      user: {
        id: internship.user.id,
        email: internship.user.email,
        name: internship.user.name,
      },
    };
  }
}