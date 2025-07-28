
import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { InternshipStatus } from './create-internship.dto';

export class UpdateInternshipDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(InternshipStatus)
  @IsOptional()
  status?: InternshipStatus;
}