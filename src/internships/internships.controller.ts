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

  // NEW: User dashboard - Get current user's dashboard data
  @Get('dashboard')
  async getUserDashboard(@Request() req: any) {
    const userId = req.user.userId; // Assuming JWT contains userId
    return this.internshipsService.getUserDashboard(userId);
  }

  // NEW: Get current user's internships (from token)
  @Get('my-internships')
  async getMyInternships(@Request() req: any) {
    const userId = req.user.userId;
    return this.internshipsService.getInternshipsByUserId(userId);
  }

  // Get internships by user ID (Admin or specific user)
  @Get('user/:userId')
  async getInternshipsByUserId(@Param('userId') userId: string): Promise<any[]> {
    return this.internshipsService.getInternshipsByUserId(userId);
  }

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
}