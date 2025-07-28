import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { 
  CreateUserDto, 
  UpdatePasswordDto, 
  UserResponseDto, 
  CreateUserResponseDto 
} from './dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService
  ) {}

  // Generate random password
  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Admin creates a new user
  async createUser(createUserDto: CreateUserDto): Promise<CreateUserResponseDto> {
    const { email, name, role } = createUserDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate random password
    const plainPassword = this.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: role || 'USER',
      },
    });

    // Send login credentials email
    try {
      await this.emailService.sendLoginCredentialsEmail(
        user.email, 
        user.name || 'User', 
        plainPassword
      );
    } catch (error) {
      console.error('Failed to send login credentials email:', error);
      // Note: We don't throw here to avoid failing user creation if email fails
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      password: plainPassword, // Return plain password only when creating
    };
  }

  // Admin gets all users
  async getAllUsers(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users;
  }

  // Admin gets user by ID
  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // Admin resets user password
  async resetUserPassword(updatePasswordDto: UpdatePasswordDto): Promise<{ message: string; newPassword: string }> {
    const { userId } = updatePasswordDto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate new password
    const newPlainPassword = this.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPlainPassword, 10);

    // Update user password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    // Send password reset notification email
    try {
      await this.emailService.sendPasswordResetNotificationEmail(
        user.email,
        user.name || 'User',
        newPlainPassword
      );
    } catch (error) {
      console.error('Failed to send password reset notification email:', error);
      // Note: We don't throw here to avoid failing password reset if email fails
    }

    return {
      message: 'Password reset successfully',
      newPassword: newPlainPassword,
    };
  }

  // Admin deletes user
  async deleteUser(id: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'User deleted successfully',
    };
  }
}