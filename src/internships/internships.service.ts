import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  CreateInternshipDto,
  UpdateInternshipDto,
  InternshipResponseDto,
  GenerateCertificateDto,
  CertificateFormat,
  CreateRemarkDto,
} from './dto';
import { RemarkResponseDto } from './dto/remark-response.dto';
import { AdminResponseRemarkDto } from './dto/admin-response-remark.dto';

@Injectable()
export class InternshipsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // Admin creates internship for a user
  async createInternship(
    createInternshipDto: CreateInternshipDto,
  ): Promise<InternshipResponseDto> {
    const { userId, title, role, startDate, endDate, description, status } =
      createInternshipDto;

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
          duration: this.calculateDuration(
            internship.startDate,
            internship.endDate,
          ),
          description: internship.description || 'No description provided',
        },
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

  async generateCertificatePDF(data: any): Promise<Buffer> {
    const html = this.generateCertificateHTML(data);

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set viewport to match certificate dimensions
    await page.setViewport({ width: 1100, height: 800 });

    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for fonts and styles to load - FIXED METHOD
    await page.evaluateHandle('document.fonts.ready');
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Use regular setTimeout instead

    // Generate PDF with exact dimensions
    const pdfBuffer = await page.pdf({
      width: '11in',
      height: '8.5in',
      landscape: true,
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    });

    await browser.close();
    return pdfBuffer;
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

    return internships.map((internship) => {
      const mapped = this.mapToResponseDto(internship);
      const today = new Date();

      if (internship.status === 'ACTIVE') {
        const daysLeft = Math.ceil(
          (internship.endDate.getTime() - today.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return {
          ...mapped,
          daysLeft: daysLeft > 0 ? daysLeft : 0,
          isOverdue: daysLeft < 0,
          progress: this.calculateProgress(
            internship.startDate,
            internship.endDate,
            today,
          ),
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
  async updateInternship(
    id: string,
    updateInternshipDto: UpdateInternshipDto,
  ): Promise<InternshipResponseDto> {
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
        startDate: updateInternshipDto.startDate
          ? new Date(updateInternshipDto.startDate)
          : undefined,
        endDate: updateInternshipDto.endDate
          ? new Date(updateInternshipDto.endDate)
          : undefined,
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
    if (
      updateInternshipDto.status === 'COMPLETED' &&
      internship.status !== 'COMPLETED'
    ) {
      try {
        const certificateData = await this.getCertificateData(id);
        const certificateHTML = this.generateCertificateHTML(certificateData);

        await this.emailService.sendInternshipCompletionEmail(
          internship.user.email,
          internship.user.name || 'User',
          {
            title: updatedInternship.title,
            role: updatedInternship.role,
            duration: this.calculateDuration(
              updatedInternship.startDate,
              updatedInternship.endDate,
            ),
            completionDate: new Date().toDateString(),
          },
          certificateHTML,
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

  async createRemark(
    userId: string,
    createRemarkDto: CreateRemarkDto,
  ): Promise<RemarkResponseDto> {
    const { internshipId, message, requestType } = createRemarkDto;

    // Check if internship exists and belongs to user
    const internship = await this.prisma.internship.findFirst({
      where: {
        id: internshipId,
        userId: userId,
      },
      include: { user: true },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found or access denied');
    }

    const remark = await this.prisma.remark.create({
      data: {
        internshipId,
        userId,
        message,
        requestType: requestType || 'GENERAL_REMARK',
        status: 'PENDING',
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        internship: {
          select: { id: true, title: true, role: true },
        },
      },
    });

    // Send notification email to admin
    try {
      await this.emailService.sendRemarkNotificationToAdmin(
        internship.user.email,
        internship.user.name || 'User',
        {
          internshipTitle: internship.title,
          requestType: remark.requestType, // ✅ Use the value from database (always has default)
          message,
          remarkId: remark.id,
        },
      );
    } catch (error) {
      console.error('Failed to send remark notification email:', error);
    }

    return this.mapRemarkToResponseDto(remark);
  }

  // User gets their remarks for an internship
  async getMyRemarksForInternship(
    userId: string,
    internshipId: string,
  ): Promise<RemarkResponseDto[]> {
    // Verify internship belongs to user
    const internship = await this.prisma.internship.findFirst({
      where: { id: internshipId, userId },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found or access denied');
    }

    const remarks = await this.prisma.remark.findMany({
      where: { internshipId, userId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        internship: { select: { id: true, title: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return remarks.map(this.mapRemarkToResponseDto);
  }

  // User gets all their remarks across all internships
  async getAllMyRemarks(userId: string): Promise<RemarkResponseDto[]> {
    const remarks = await this.prisma.remark.findMany({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        internship: { select: { id: true, title: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return remarks.map(this.mapRemarkToResponseDto);
  }

  // Admin gets all remarks (for admin dashboard)
  async getAllRemarks(): Promise<RemarkResponseDto[]> {
    const remarks = await this.prisma.remark.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        internship: { select: { id: true, title: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return remarks.map(this.mapRemarkToResponseDto);
  }

  // Admin responds to remark
  async adminRespondToRemark(
    remarkId: string,
    adminResponseDto: AdminResponseRemarkDto,
  ): Promise<RemarkResponseDto> {
    const remark = await this.prisma.remark.findUnique({
      where: { id: remarkId },
      include: {
        user: true,
        internship: true,
      },
    });

    if (!remark) {
      throw new NotFoundException('Remark not found');
    }

    const updatedRemark = await this.prisma.remark.update({
      where: { id: remarkId },
      data: {
        adminResponse: adminResponseDto.adminResponse,
        status: adminResponseDto.status,
        updatedAt: new Date(),
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        internship: { select: { id: true, title: true, role: true } },
      },
    });

    // Send response notification to user
    try {
      await this.emailService.sendRemarkResponseToUser(
        remark.user.email,
        remark.user.name || 'User',
        {
          internshipTitle: remark.internship.title,
          originalMessage: remark.message,
          adminResponse: adminResponseDto.adminResponse,
          status: adminResponseDto.status,
        },
      );
    } catch (error) {
      console.error('Failed to send remark response email:', error);
    }

    return this.mapRemarkToResponseDto(updatedRemark);
  }

  // Check if user can download certificate
  async canUserDownloadCertificate(
    userId: string,
    internshipId: string,
  ): Promise<{ canDownload: boolean; reason?: string }> {
    const internship = await this.prisma.internship.findFirst({
      where: { id: internshipId, userId },
    });

    if (!internship) {
      return {
        canDownload: false,
        reason: 'Internship not found or access denied',
      };
    }

    if (internship.status !== 'COMPLETED') {
      return {
        canDownload: false,
        reason: 'Certificate is only available for completed internships',
      };
    }

    return { canDownload: true };
  }

  // Add this method to your InternshipsService
  // Add this method to your InternshipsService class
  // Add this method to your InternshipsService class
  async generateCertificatePNG(data: any): Promise<Buffer> {
    const html = this.generateCertificateHTML(data);

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 900, height: 700 });

    const pngBuffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 900, height: 700 },
    });

    await browser.close();
    return pngBuffer;
  }

  // Get enhanced internship details for user (with certificate availability)
  async getMyInternshipDetails(
    userId: string,
    internshipId: string,
  ): Promise<any> {
    const internship = await this.prisma.internship.findFirst({
      where: { id: internshipId, userId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!internship) {
      throw new NotFoundException('Internship not found or access denied');
    }

    const mapped = this.mapToResponseDto(internship);
    const today = new Date();

    // Add enhanced data
    const enhanced = {
      ...mapped,
      canDownloadCertificate: internship.status === 'COMPLETED',
      daysLeft:
        internship.status === 'ACTIVE'
          ? Math.max(
              0,
              Math.ceil(
                (internship.endDate.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : null,
      progress:
        internship.status === 'ACTIVE'
          ? this.calculateProgress(
              internship.startDate,
              internship.endDate,
              today,
            )
          : internship.status === 'COMPLETED'
            ? 100
            : 0,
      duration: this.calculateDuration(
        internship.startDate,
        internship.endDate,
      ),
      isOverdue: internship.status === 'ACTIVE' && internship.endDate < today,
    };

    return enhanced;
  }

  // Get user dashboard data
  async getUserDashboard(userId: string): Promise<any> {
    const internships = await this.getInternshipsByUserId(userId);

    const stats = {
      total: internships.length,
      active: internships.filter((i) => i.status === 'ACTIVE').length,
      completed: internships.filter((i) => i.status === 'COMPLETED').length,
      cancelled: internships.filter((i) => i.status === 'CANCELLED').length,
    };

    const activeInternships = internships.filter((i) => i.status === 'ACTIVE');
    const completedInternships = internships.filter(
      (i) => i.status === 'COMPLETED',
    );

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
      duration: this.calculateDuration(
        internship.startDate,
        internship.endDate,
      ),
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
  font-family: 'Arial', sans-serif;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  margin: 0;
  padding: 20px;
  width: 11in;
  height: 8.5in;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
        
        .certificate {
  background: white;
  width: 10.5in;    /* Slightly smaller than page */
  height: 8in;      /* Slightly smaller than page */
  position: relative;
  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
  border-radius: 20px;
  overflow: hidden;
  box-sizing: border-box;
}
        
        /* Top section with logo and medal */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 40px 60px 20px 60px;
          position: relative;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .logo-icon {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          color: white;
          font-weight: bold;
          font-size: 24px;
        }
        
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #1e3c72;
          letter-spacing: 1px;
        }
        
        .medal {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          box-shadow: 0 5px 15px rgba(255, 215, 0, 0.3);
        }
        
        .medal::before {
          content: '★';
          font-size: 40px;
          color: #b8860b;
        }
        
        /* Main content */
        .main-content {
          text-align: center;
          padding: 20px 60px;
        }
        
        .certificate-title {
          font-size: 48px;
          font-weight: bold;
          color: #1e3c72;
          margin-bottom: 10px;
          letter-spacing: 2px;
        }
        
        .certificate-subtitle {
          font-size: 20px;
          color: #666;
          margin-bottom: 40px;
          text-transform: uppercase;
          letter-spacing: 3px;
        }
        
        .recognition-text {
          font-size: 18px;
          color: #333;
          margin-bottom: 20px;
        }
        
        .recipient-name {
          font-size: 42px;
          font-weight: bold;
          color: #1e3c72;
          margin: 30px 0;
          border-bottom: 3px solid #1e3c72;
          padding-bottom: 10px;
          display: inline-block;
        }
        
        .achievement-text {
          font-size: 16px;
          line-height: 1.8;
          color: #444;
          max-width: 800px;
          margin: 0 auto 40px auto;
          text-align: justify;
        }
        
        .date {
          font-size: 18px;
          color: #666;
          margin-bottom: 50px;
        }
        
        /* Bottom section with geometric shapes */
        .bottom-section {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 120px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        
        .signatures {
          display: flex;
          justify-content: space-between;
          width: 100%;
          padding: 0 60px 30px 60px;
          position: relative;
          z-index: 2;
        }
        
        .signature {
          text-align: center;
        }
        
        .signature-line {
          width: 200px;
          border-bottom: 2px solid #1e3c72;
          margin-bottom: 8px;
        }
        
        .signature-name {
          font-weight: bold;
          color: #1e3c72;
          font-size: 16px;
        }
        
        .signature-title {
          color: #666;
          font-size: 14px;
        }
        
        /* Geometric decorations */
        .geometric-left {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 300px;
          height: 120px;
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          clip-path: polygon(0 100%, 100% 100%, 70% 0, 0 20%);
        }
        
        .geometric-right {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 300px;
          height: 120px;
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          clip-path: polygon(30% 0, 100% 20%, 100% 100%, 0 100%);
        }
        
        /* Certificate ID */
        .certificate-id {
          position: absolute;
          top: 20px;
          right: 20px;
          font-size: 12px;
          color: #999;
          font-family: 'Courier New', monospace;
        }
      </style>
    </head>
    <body>
      <div class="certificate">
        <div class="certificate-id">ID: ${data.certificateId}</div>
        
        <div class="header">
          <div class="logo">
            <div class="logo-icon">KL</div>
            <div class="company-name">KYRO LEARN</div>
          </div>
          <div class="medal"></div>
        </div>
        
        <div class="main-content">
          <h1 class="certificate-title">CERTIFICATE</h1>
          <p class="certificate-subtitle">OF COMPLETION</p>
          
          <p class="recognition-text">This is to recognize and honor</p>
          
          <div class="recipient-name">${data.userName}</div>
          
          <p class="achievement-text">
            for outstanding achievements in the ${data.internshipTitle} program as ${data.role}, 
            where they consistently demonstrated exceptional leadership qualities, effective communication, 
            and a collaborative spirit. Their ability to motivate others, coupled with strategic 
            decision-making, made them a standout participant in the program.
          </p>
          
          <p class="date">${data.issueDate}</p>
        </div>
        
        <div class="bottom-section">
          <div class="geometric-left"></div>
          <div class="geometric-right"></div>
          
          <div class="signatures">
            <div class="signature">
              <div class="signature-line"></div>
              <div class="signature-name">Program Director</div>
              <div class="signature-title">Kyro Learn</div>
            </div>
            
            <div class="signature">
              <div class="signature-line"></div>
              <div class="signature-name">General Manager</div>
              <div class="signature-title">Operations</div>
            </div>
          </div>
        </div>
      </div>
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
  private calculateProgress(
    startDate: Date,
    endDate: Date,
    currentDate: Date,
  ): number {
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = currentDate.getTime() - startDate.getTime();
    const progress = Math.min(
      Math.max((elapsed / totalDuration) * 100, 0),
      100,
    );
    return Math.round(progress);
  }

  private mapRemarkToResponseDto(remark: any): RemarkResponseDto {
    return {
      id: remark.id,
      internshipId: remark.internshipId,
      userId: remark.userId,
      message: remark.message,
      requestType: remark.requestType,
      status: remark.status,
      adminResponse: remark.adminResponse,
      createdAt: remark.createdAt,
      updatedAt: remark.updatedAt,
      user: {
        id: remark.user.id,
        email: remark.user.email,
        name: remark.user.name,
      },
      internship: {
        id: remark.internship.id,
        title: remark.internship.title,
        role: remark.internship.role,
      },
    };
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
