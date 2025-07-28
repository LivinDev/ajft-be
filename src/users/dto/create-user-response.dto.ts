import { UserResponseDto } from "./user-response.dto";

export class CreateUserResponseDto extends UserResponseDto {
  password: string; // Only shown when user is created
}