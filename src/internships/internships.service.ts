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

    // Use production configuration
    const isProduction = process.env.NODE_ENV === 'production';

    const browserOptions = isProduction
      ? {
          executablePath: '/usr/bin/google-chrome-stable',
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
          ],
        }
      : {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        };

    const browser = await puppeteer.launch(browserOptions);

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1100, height: 800 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.evaluateHandle('document.fonts.ready');
      await new Promise((resolve) => setTimeout(resolve, 1000));

     const pdfBuffer = await page.pdf({
  format: 'Letter',
  landscape: true,
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});

      return pdfBuffer;
    } finally {
      await browser.close();
    }
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

    const isProduction = process.env.NODE_ENV === 'production';

    const browserOptions = isProduction
      ? {
          executablePath: '/usr/bin/google-chrome-stable',
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
          ],
        }
      : {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        };

    const browser = await puppeteer.launch(browserOptions);

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.setViewport({ width: 900, height: 700 });

      const pngBuffer = await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: { x: 0, y: 0, width: 900, height: 700 },
      });

      return pngBuffer;
    } finally {
      await browser.close();
    }
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
// Generate certificate HTML template
// Generate certificate HTML template
generateCertificateHTML(data: any): string {
  return `
<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <title>Certificate – ${data.userName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Dancing+Script:wght@700&family=Crimson+Text:wght@400;600&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            width: 11in;
            height: 8.5in;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #f5f2ed 0%, #e8e2d5 100%);
            font-family: 'Playfair Display', serif;
        }

        .cert {
            position: relative;
            width: 10.8in;
            height: 8.3in;
            background: #fff;
            border: 32px solid transparent;
            border-image: linear-gradient(45deg, #c9b037, #f4e87c, #c9b037, #8b7355) 1;
            border-radius: 0;
            overflow: hidden;
            box-shadow:
                0 0 0 8px #c9b037,
                0 0 0 12px #fff,
                0 0 0 16px #8b7355,
                0 20px 40px rgba(0, 0, 0, 0.15);
        }

        /* Decorative corner elements */
        .corner-tl,
        .corner-tr,
        .corner-bl,
        .corner-br {
            position: absolute;
            width: 80px;
            height: 80px;
            background: radial-gradient(circle, #c9b037 0%, #f4e87c 50%, #c9b037 100%);
            z-index: 1;
        }

        .corner-tl {
            top: -40px;
            left: -40px;
            border-radius: 0 0 100% 0;
        }

        .corner-tr {
            top: -40px;
            right: -40px;
            border-radius: 0 0 0 100%;
        }

        .corner-bl {
            bottom: -40px;
            left: -40px;
            border-radius: 0 100% 0 0;
        }

        .corner-br {
            bottom: -40px;
            right: -40px;
            border-radius: 100% 0 0 0;
        }

        /* Rich geometric background pattern */
        .bg-pattern {
            position: absolute;
            inset: 0;
            background-image:
                radial-gradient(circle at 25% 25%, rgba(201, 176, 55, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 75% 25%, rgba(201, 176, 55, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 25% 75%, rgba(201, 176, 55, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 75% 75%, rgba(201, 176, 55, 0.08) 0%, transparent 50%),
                linear-gradient(45deg, transparent 40%, rgba(201, 176, 55, 0.03) 50%, transparent 60%),
                linear-gradient(-45deg, transparent 40%, rgba(201, 176, 55, 0.03) 50%, transparent 60%);
            background-size: 120px 120px, 120px 120px, 120px 120px, 120px 120px, 80px 80px, 80px 80px;
        }

        /* Ornamental borders */
        .ornamental-border {
            position: absolute;
            inset: 20px;
            border: 3px solid;
            border-image: linear-gradient(45deg, #c9b037, transparent, #c9b037, transparent, #c9b037) 1;
            pointer-events: none;
        }

        .ornamental-border::before {
            content: '';
            position: absolute;
            inset: 15px;
            border: 1px solid rgba(201, 176, 55, 0.3);
        }

        .content {
            position: relative;
            z-index: 2;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 100px 60px 30px 60px;
        }

        /* Logo styling with company name */
        .logo-section {
            position: absolute;
            left: 5%;
            display: flex;
            align-items: center;
            z-index: 4;
            top: 6%;
        }

        .logo {
            width: 80px;
            height: auto;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
            margin-right: 15px;
            
        }

        .company-name {
            font-family: 'Playfair Display', serif;
            font-size: 16px;
            font-weight: 600;
            color: #333;
            line-height: 1.4;
            letter-spacing: 1px;
            max-width: 150px;
        }

        /* Gold ribbon badge - properly integrated */
        .badge {
            position: absolute;
            top: 6%;
            right: 4%;
            width: 100px;
            height: auto;
            z-index: 3;
            filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.4));
            transform: rotate(-8deg);
        }

        .header {
            text-align: center;
            margin-bottom: 10px;
            margin-top: 40px;
        }

        .title {
            font-size: 38px;
            font-weight: 700;
            letter-spacing: 4px;
            color: #1e1e1e;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
            margin-bottom: 8px;
        }

        .subtitle {
            font-size: 18px;
            letter-spacing: 2px;
            color: #666;
            font-weight: 400;
        }

        .name-section {
            text-align: center;
            margin: 15px 0;
            position: relative;
        }

        .awarded {
            font-size: 20px;
            color: #444;
            margin-bottom: 15px;
            font-family: 'Crimson Text', serif;
        }

        .name {
            font-family: 'Dancing Script', cursive;
            font-size: 60px;
            color: #c9b037;
            font-weight: 700;
           
            position: relative;
            z-index: 3;
        }

        .name::after {
            content: '';
            position: absolute;
            bottom: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 80%;
            height: 3px;
            background: linear-gradient(to right, transparent, #c9b037, transparent);
        }

        .details {
            max-width: 680px;
            font-size: 18px;
            color: #333;
            line-height: 1.6;
            text-align: center;
            font-family: 'Crimson Text', serif;
            margin: 15px 0;
        }

        .details strong {
            font-weight: 600;
            color: #1e1e1e;
        }

        .date-section {
            text-align: center;
            margin: 10px 0 0 0;
        }

        .date {
            font-size: 20px;
            color: #444;
            font-family: 'Crimson Text', serif;
        }

        /* SIGNATURE AREA - REDUCED GAP */
        .signature-section {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: -5px;
            width: 100%;
        }

        .signature-box {
            text-align: center;
            padding: 15px;
            min-width: 320px;
            margin: 0 auto;
        }

        .signature-image {
            width: 280px !important;
            height: 90px !important;
            object-fit: contain;
            background: transparent;
            border: none;
            margin: 8px auto;
            display: block !important;
        }

        .signature-name {
            font-size: 18px;
            font-weight: 700;
            color: #1e1e1e;
            margin-top: -20px;
            margin-bottom: 3px;
            font-family: 'Playfair Display', serif;
        }

        .signature-title {
            font-size: 14px;
            color: #666;
            font-style: italic;
            font-family: 'Crimson Text', serif;
        }

        /* Geometric accents */
        .geometric-accent {
            position: absolute;
            width: 20px;
            height: 20px;
            background: #c9b037;
            opacity: 0.6;
            z-index: 1;
        }

        .geo-1 {
            top: 20%;
            left: 15%;
            transform: rotate(45deg);
        }

        .geo-2 {
            top: 25%;
            right: 20%;
            border-radius: 50%;
        }

        .geo-3 {
            bottom: 30%;
            left: 18%;
            clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }

        .geo-4 {
            bottom: 35%;
            right: 15%;
            transform: rotate(45deg);
        }

        @media print {
            body {
                background: #fff;
            }

            .cert {
                box-shadow: none;
            }
        }
    </style>
</head>

<body>
    <div class="cert">
        <!-- Decorative corners -->
        <div class="corner-tl"></div>
        <div class="corner-tr"></div>
        <div class="corner-bl"></div>
        <div class="corner-br"></div>

        <!-- Background patterns -->
        <div class="bg-pattern"></div>
        <div class="ornamental-border"></div>

        <!-- Geometric accents -->
        <div class="geometric-accent geo-1"></div>
        <div class="geometric-accent geo-2"></div>
        <div class="geometric-accent geo-3"></div>
        <div class="geometric-accent geo-4"></div>

        <!-- Logo and Company Name -->
        <div class="logo-section">
            <img class="logo" src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1753822641/logo-2048_1_geghxn.png"
                alt="Anand Jivan Foundation Trust">
            <div class="company-name">Anand Jivan Foundation Trust</div>
        </div>

        <!-- Gold ribbon badge -->
        <img class="badge"
            src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1753881880/pngkey.com-gold-ribbon-png-115183_cotmiq.png"
            alt="Gold Award Ribbon">

        <div class="content">
            <!-- Header -->
            <div class="header">
                <div class="title">CERTIFICATE OF INTERNSHIP</div>
                <div class="subtitle">Presented to</div>
            </div>

            <!-- Name section -->
            <div class="name-section">
                <div class="awarded">This certifies that</div>
                <div class="name">${data.userName}</div>
            </div>

            <!-- Details -->
            <div class="details">
                Has successfully completed the <strong>${data.internshipTitle}</strong> program in the capacity of
                <strong>${data.role}</strong>, demonstrating exceptional dedication and professional excellence from
                <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong>.
            </div>

            <!-- Date -->
            <div class="date-section">
                <div class="date">Issued on ${data.issueDate}</div>
            </div>

            <!-- SIGNATURE SECTION - REDUCED GAP -->
            <div class="signature-section">
                <div class="signature-box">
                    <img class="signature-image"
                        src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1753881046/zzzzzzzzzzaa-removebg-preview_s5dx4g.png"
                        alt="Guddu Kumar Signature" onload="console.log('Signature loaded successfully')"
                        onerror="console.log('Signature failed to load'); this.style.border='3px solid red'; this.alt='SIGNATURE MISSING';">
                    <div class="signature-name">Guddu Kumar</div>
                    <div class="signature-title">Chief Executive Officer</div>
                </div>
            </div>
        </div>
    </div>
</body>

</html>`;
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
