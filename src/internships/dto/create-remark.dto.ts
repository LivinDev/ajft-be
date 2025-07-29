// src/internships/dto/create-remark.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRemarkDto {
  @IsString()
  @IsNotEmpty()
  internshipId: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  requestType?: 'CHANGE_REQUEST' | 'GENERAL_REMARK' | 'EXTENSION_REQUEST' = 'GENERAL_REMARK';
}