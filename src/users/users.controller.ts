import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
  UseGuards, 
  Patch, 
  Put
} from '@nestjs/common';
import { UsersService } from './users.service';
import { 
  CreateUserDto, 
  UpdatePasswordDto, 
  UserResponseDto, 
  CreateUserResponseDto 
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, AdminGuard) // All routes require admin access
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto): Promise<CreateUserResponseDto> {
    return this.usersService.createUser(createUserDto);
  }

  @Get()
  async getAllUsers(): Promise<UserResponseDto[]> {
    return this.usersService.getAllUsers();
  }

  @Get(':id')
  async getUserById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }
@Put(':id')
async updateUser(
  @Param('id') id: string, 
  @Body() updateUserDto: UpdateUserDto
): Promise<UserResponseDto> {
  return this.usersService.updateUser(id, updateUserDto);
}
  @Patch(':id/reset-password')
  async resetUserPassword(@Param('id') userId: string): Promise<{ message: string; newPassword: string }> {
    return this.usersService.resetUserPassword({ userId, newPassword: '' });
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string): Promise<{ message: string }> {
    return this.usersService.deleteUser(id);
  }
}