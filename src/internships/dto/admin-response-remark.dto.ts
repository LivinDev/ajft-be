// src/internships/dto/admin-response-remark.dto.ts
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class AdminResponseRemarkDto {
  @IsString()
  @IsNotEmpty()
  adminResponse: string;

  @IsEnum(['REVIEWED', 'RESOLVED'])
  @IsNotEmpty()
  status: 'REVIEWED' | 'RESOLVED';
}