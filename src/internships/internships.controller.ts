import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards,
  Query,
  Res,
  Request 
} from '@nestjs/common';
import { Response } from 'express';
import { InternshipsService } from './internships.service';
import { 
  CreateInternshipDto, 
  UpdateInternshipDto, 
  InternshipResponseDto 
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminResponseRemarkDto } from './dto/admin-response-remark.dto';
import { RemarkResponseDto } from './dto/remark-response.dto';
import { CreateRemarkDto } from './dto/create-remark.dto';

@Controller('internships')
@UseGuards(JwtAuthGuard)
export class InternshipsController {
  constructor(private internshipsService: InternshipsService) {}

  // Admin creates internship for a user
  @Post()
  @UseGuards(AdminGuard)
  async createInternship(@Body() createInternshipDto: CreateInternshipDto): Promise<InternshipResponseDto> {
    return this.internshipsService.createInternship(createInternshipDto);
  }

  // Admin gets all internships
  @Get()
  @UseGuards(AdminGuard)
  async getAllInternships(): Promise<InternshipResponseDto[]> {
    return this.internshipsService.getAllInternships();
  }

  // STATIC ROUTES FIRST - These must come before dynamic :id routes

  // User dashboard - Get current user's dashboard data
  @Get('dashboard')
  async getUserDashboard(@Request() req: any) {
    const userId = req.user.id; // Fixed: Changed from userId to id
    return this.internshipsService.getUserDashboard(userId);
  }

  // Get current user's internships (from token)
  @Get('my-internships')
  async getMyInternships(@Request() req: any) {
    const userId = req.user.id; // Fixed: Changed from userId to id
    return this.internshipsService.getInternshipsByUserId(userId);
  }

  // User gets all their remarks
  @Get('my-remarks')
  async getAllMyRemarks(@Request() req: any): Promise<RemarkResponseDto[]> {
    const userId = req.user.id; // Fixed: Changed from userId to id
    return this.internshipsService.getAllMyRemarks(userId);
  }

  // Get internships by user ID (Admin or specific user)
  @Get('user/:userId')
  async getInternshipsByUserId(@Param('userId') userId: string): Promise<any[]> {
    return this.internshipsService.getInternshipsByUserId(userId);
  }

  // Admin gets all remarks
  @Get('admin/remarks')
  @UseGuards(AdminGuard)
  async getAllRemarks(): Promise<RemarkResponseDto[]> {
    return this.internshipsService.getAllRemarks();
  }

  // Admin responds to remark
  @Patch('admin/remarks/:remarkId')
  @UseGuards(AdminGuard)
  async adminRespondToRemark(
    @Param('remarkId') remarkId: string,
    @Body() adminResponseDto: AdminResponseRemarkDto
  ): Promise<RemarkResponseDto> {
    return this.internshipsService.adminRespondToRemark(remarkId, adminResponseDto);
  }

  // User gets detailed internship info (with certificate availability)
  @Get('my-internships/:id/details')
  async getMyInternshipDetails(@Request() req: any, @Param('id') internshipId: string) {
    const userId = req.user.id; // Fixed: Changed from userId to id
    return this.internshipsService.getMyInternshipDetails(userId, internshipId);
  }

  // Create remark
  @Post('remarks')
  async createRemark(@Request() req: any, @Body() createRemarkDto: CreateRemarkDto): Promise<RemarkResponseDto> {
    const userId = req.user.id || req.user.userId || req.user.sub;
    return this.internshipsService.createRemark(userId, createRemarkDto);
  }

  // SPECIFIC :id ROUTES - These must come before the generic @Get(':id')

  // Download certificate as PNG
  @Get(':id/certificate-png')
  async downloadCertificateAsPNG(@Param('id') id: string, @Res() res: Response, @Request() req: any) {
    try {
      const userId = req.user.id;
      
      // Check if this internship belongs to the user OR if user is admin
      const internship = await this.internshipsService.getInternshipById(id);
      
      if (internship.user.id !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ 
          error: 'Access denied. You can only download certificates for your own internships.' 
        });
      }
      
      // Check if internship is completed
      if (internship.status !== 'COMPLETED') {
        return res.status(400).json({ 
          error: 'Certificate is only available for completed internships.' 
        });
      }
      
      const data = await this.internshipsService.getCertificateData(id);
      const pngBuffer = await this.internshipsService.generateCertificatePNG(data);
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="certificate_${data.userName?.replace(/[^a-zA-Z0-9]/g, '_')}.png"`);
      res.send(pngBuffer);
    } catch (error) {
      console.error('Certificate generation error:', error);
      res.status(500).json({ error: 'Failed to generate certificate' });
    }
  }

  // Get certificate data (for frontend generation)
  @Get(':id/certificate-data')
  async getCertificateData(@Param('id') id: string) {
    const data = await this.internshipsService.getCertificateData(id);
    
    return {
      success: true,
      data,
      message: 'Certificate data retrieved successfully',
    };
  }

  // Generate certificate HTML (for frontend to convert to PDF/Image)
  @Get(':id/certificate-template')
  async getCertificateTemplate(@Param('id') id: string, @Res() res: Response) {
    try {
      const data = await this.internshipsService.getCertificateData(id);
      const html = this.internshipsService.generateCertificateHTML(data);
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.send(html);
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message || 'Certificate template not found',
      });
    }
  }

  // Direct certificate download endpoint (opens certificate in new tab)
  @Get(':id/certificate-download')
  async downloadCertificate(@Param('id') id: string, @Res() res: Response) {
    try {
      const data = await this.internshipsService.getCertificateData(id);
      const html = this.internshipsService.generateCertificateHTML(data);
      
      const filename = `certificate_${data.userName?.replace(/\s+/g, '_')}_${id.slice(-8)}.html`;
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      res.send(html);
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message || 'Certificate not found',
      });
    }
  }


  @Get(':id/certificate-pdf')
async downloadCertificateAsPDF(@Param('id') id: string, @Res() res: Response, @Request() req: any) {
  try {
    const userId = req.user.id;
    
    // Your existing security checks...
    const internship = await this.internshipsService.getInternshipById(id);
    
    if (internship.user.id !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Access denied. You can only download certificates for your own internships.' 
      });
    }
    
    if (internship.status !== 'COMPLETED') {
      return res.status(400).json({ 
        error: 'Certificate is only available for completed internships.' 
      });
    }
    
    const data = await this.internshipsService.getCertificateData(id);
    const pdfBuffer = await this.internshipsService.generateCertificatePDF(data);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${data.userName?.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Certificate generation error:', error);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
}


  // Preview certificate (for testing purposes)
  @Get(':id/certificate-preview')
  async previewCertificate(@Param('id') id: string, @Res() res: Response) {
    try {
      const data = await this.internshipsService.getCertificateData(id);
      const html = this.internshipsService.generateCertificateHTML(data);
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      
      res.send(html);
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message || 'Certificate preview not available',
      });
    }
  }

  // Check if user can download certificate
  @Get(':id/certificate-eligibility')
  async checkCertificateEligibility(@Request() req: any, @Param('id') internshipId: string) {
    const userId = req.user.id; // Fixed: Changed from userId to id
    return this.internshipsService.canUserDownloadCertificate(userId, internshipId);
  }

  // User gets their remarks for specific internship
  @Get(':id/remarks')
  async getMyRemarksForInternship(@Request() req: any, @Param('id') internshipId: string): Promise<RemarkResponseDto[]> {
    const userId = req.user.id; // Fixed: Changed from userId to id
    return this.internshipsService.getMyRemarksForInternship(userId, internshipId);
  }

  // GENERIC ROUTES LAST - These catch-all routes must be at the end

  // Get specific internship
  @Get(':id')
  async getInternshipById(@Param('id') id: string): Promise<InternshipResponseDto> {
    return this.internshipsService.getInternshipById(id);
  }

  // Admin updates internship
  @Patch(':id')
  @UseGuards(AdminGuard)
  async updateInternship(
    @Param('id') id: string,
    @Body() updateInternshipDto: UpdateInternshipDto,
  ): Promise<InternshipResponseDto> {
    return this.internshipsService.updateInternship(id, updateInternshipDto);
  }

  // Admin deletes internship
  @Delete(':id')
  @UseGuards(AdminGuard)
  async deleteInternship(@Param('id') id: string): Promise<{ message: string }> {
    return this.internshipsService.deleteInternship(id);
  }
}