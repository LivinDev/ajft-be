import { IsEnum, IsOptional } from 'class-validator';

export enum CertificateFormat {
  PDF = 'PDF',
  IMAGE = 'IMAGE',
}

export class GenerateCertificateDto {
  @IsEnum(CertificateFormat)
  @IsOptional()
  format?: CertificateFormat = CertificateFormat.PDF;
}
