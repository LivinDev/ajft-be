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
      await page.setViewport({ width: 1122, height: 794 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.evaluateHandle('document.fonts.ready');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pdfBuffer = await page.pdf({
        width: '11.69in',
        height: '8.27in',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true,
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
  // Updated generateCertificateHTML method for your InternshipsService

  generateCertificateHTML(data: any): string {
    return `
<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <title>Certificate - ${data.userName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Crimson+Text:wght@400;600&display=swap');

        @page {
    size: 11.69in 8.27in;
    margin: 0;
}

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            width: 11.69in;
            height: 8.27in;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #f0f4f8 0%, #e8ecf0 100%);
            font-family: 'Playfair Display', serif;
        }

        .cert {
            position: relative;
            width: 11.69in;
            height: 8.27in;
            background: #fff;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        }

        /* Frame corners using the specific images for each corner - larger size to eliminate gaps */
        .frame-corner {
            position: absolute;
            width: 300px;
            height: 300px;
            background-size: 100% 100%;
            background-repeat: no-repeat;
            z-index: 1;
        }

        .frame-tl {
            top: -10px;
            left: -10px;
            background-image: url('https://res.cloudinary.com/dkc66bu0s/image/upload/v1754057474/d1_1_obwupi.png');
        }

        .frame-tr {
            top: -10px;
            right: -10px;
            background-image: url('https://res.cloudinary.com/dkc66bu0s/image/upload/v1754055995/d1_hrdfme.png');
        }

        .frame-bl {
            bottom: -10px;
            left: -10px;
            background-image: url('https://res.cloudinary.com/dkc66bu0s/image/upload/v1754057076/d1_qfnkut.png');
        }

        .frame-br {
            bottom: -10px;
            right: -10px;
            background-image: url('https://res.cloudinary.com/dkc66bu0s/image/upload/v1754057579/d1_4_h6mnbs.png');
        }

        /* Header Logos Section */
        .header-logos {
            position: absolute;
            top: 60px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 200px;
            z-index: 3;
        }

        .logo-left,
        .logo-center,
        .logo-right {
            height: 100px;
            width: auto;
            object-fit: contain;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }

        .logo-center {
            height: 90px;
        }

        /* Content area */
        .content {
            position: relative;
            z-index: 2;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 150px 100px 160px 100px;
        }

        /* Certificate Title */
        .title-section {
            text-align: center;
            margin-bottom: 48px;
        }

        .main-title {
            font-size: 58px;
            font-weight: 900;
            letter-spacing: 6px;
            color: #1e3a8a;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
            margin-bottom: 10px;
            font-family: 'Playfair Display', serif;
        }

        .sub-title {
            font-size: 32px;
            letter-spacing: 3px;
            color: #1e3a8a;
            font-weight: 600;
        }

        /* Certification Text */
        .certification-text {
            text-align: center;
            margin: 2px 0;
            font-size: 18px;
            color: #374151;
            font-style: italic;
            font-family: 'Crimson Text', serif;
        }

        /* Name Section */
        .name-section {
            text-align: center;
            margin: 20px 0;
            position: relative;
        }

        .recipient-name {
            font-size: 42px;
            font-weight: 700;
            color: #1e3a8a;
            font-family: 'Playfair Display', serif;
            text-transform: uppercase;
            letter-spacing: 2px;
            position: relative;
            padding: 0 40px;
        }

        .name-underline {
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            height: 3px;
            background: linear-gradient(to right, transparent, #1e3a8a, transparent);
        }

        /* Details Section */
        .details-section {
            max-width: 600px;
            text-align: center;
            margin: 25px 0;
        }

        .details-text {
            font-size: 16px;
            line-height: 1.8;
            color: #374151;
            font-family: 'Crimson Text', serif;
        }

        .details-text strong {
            color: #1e3a8a;
            font-weight: 600;
        }

        /* Signature Section - positioned like the reference */
        .signature-area {
            position: absolute;
            bottom: 80px;
            left: 40px;
            right: 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 100px;
            z-index: 2;
        }

        .signature-box {
            text-align: center;
            width: 280px;
        }

        .signature-image {
            width: 200px;
            height: 100px;
            object-fit: contain;
            margin-bottom: -5px;
        }

        .signature-line {
            width: 200px;
            height: 3px;
            background: #1e3a8a;
            margin: 0 auto 8px auto;
        }

        .signature-name {
            font-size: 16px;
            font-weight: 700;
            color: #1e3a8a;
            margin-bottom: 3px;
            font-family: 'Playfair Display', serif;
            text-transform: uppercase;
        }

        .signature-title {
            font-size: 12px;
            color: #6b7280;
            font-style: italic;
            font-family: 'Crimson Text', serif;
        }

        /* Central Seal - positioned between signatures */
        .central-seal {
            position: absolute;
            bottom: 25px;
            left: 50%;
            transform: translateX(-50%);
            width: 130px;
            height: 130px;
            z-index: 3;
        }

        .seal-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
        }

        /* Date section */
        .date-section {
            text-align: center;
            font-size: 14px;
            color: #6b7280;
            font-family: 'Crimson Text', serif;
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
        <!-- Frame corners using the provided golden frame image -->
        <div class="frame-corner frame-tl"></div>
        <div class="frame-corner frame-tr"></div>
        <div class="frame-corner frame-bl"></div>
        <div class="frame-corner frame-br"></div>

        <!-- Header Logos -->
        <div class="header-logos">
            <!-- Left: 75th Anniversary Logo -->
            <img class="logo-left" src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1754055994/d3_eszy6e.png"
                alt="75th Anniversary">

            <!-- Center: Government Emblem -->
            <img class="logo-center" src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1754055994/d4_cfsrlt.png"
                alt="Government Emblem">

            <!-- Right: Organization Logo -->
            <img class="logo-right"
                src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1753822641/logo-2048_1_geghxn.png"
                alt="Anand Jivan Foundation Trust">
        </div>

        <div class="content">
            <!-- Certificate Title -->
            <div class="title-section">
                <div class="main-title">CERTIFICATE</div>
                <div class="sub-title">OF INTERNSHIP</div>
            </div>

            <!-- Certification Statement -->
            <div class="certification-text">
                This is to certify that:
            </div>

            <!-- Recipient Name -->
            <div class="name-section">
                <div class="recipient-name">${data.userName}</div>
                <div class="name-underline"></div>
            </div>

            <!-- Details -->
            <div class="details-section">
                <div class="details-text">
                      has successfully completed an internship at <strong>Anand Jivan Foundation Trust</strong> 
        as a <strong>${data.internshipTitle}</strong> from <strong>${data.startDate}</strong> to 
        <strong>${data.endDate}</strong>, and has shown sincerity and active participation throughout the program.
                </div>
            </div>

            <!-- Date -->
            <div class="date-section">
                Issued on ${data.issueDate}
            </div>
        </div>

        <!-- Signature Section - positioned at bottom -->
        <div class="signature-area">
            <div class="signature-box">
                <img class="signature-image"
                    src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1754062089/output-onlinepngtools_4_o9bqc8.png"
                    alt="Guddu Kumar Signature">
                <div class="signature-line"></div>
                <div class="signature-name">MR. GUDDU KUMAR</div>
                <div class="signature-title">Chief Executive Officer</div>
            </div>
           

            <div class="signature-box">
            
                <div class="signature-box" >
                 <img class="signature-image"
                    src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1754070228/output-onlinepngtools_5_z7uxxv.png"
                    alt="Guddu Kumar Signature">
                </div> <!-- Space for signature -->
                <div class="signature-line"></div>
                <div class="signature-name">MRS. POOJA KUMARI</div>
                <div class="signature-title">Program Director</div>
            </div>
        </div>

        <!-- Central Seal -->
        <div class="central-seal">
            <img class="seal-image" src="https://res.cloudinary.com/dkc66bu0s/image/upload/v1754055994/d2_q7shvi.png"
                alt="Official Seal">
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
