export class InternshipResponseDto {
  id: string;
  title: string;
  role: string;
  startDate: Date;
  endDate: Date;
  description: string | null;
  status: string;
  certificateUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}