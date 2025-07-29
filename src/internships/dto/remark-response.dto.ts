// src/internships/dto/remark-response.dto.ts
export class RemarkResponseDto {
  id: string;
  internshipId: string;
  userId: string;
  message: string;
  requestType: string;
  status: 'PENDING' | 'REVIEWED' | 'RESOLVED';
  adminResponse?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  internship: {
    id: string;
    title: string;
    role: string;
  };
}