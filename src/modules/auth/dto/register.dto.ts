import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({
    example: 'Nguyen Van A',
    description: 'Họ và tên đầy đủ của người dùng',
  })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  full_name: string;

  @ApiProperty({
    example: 'a@gmail.com',
    description: 'Email dùng để đăng nhập',
  })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Mật khẩu đăng ký, tối thiểu 6 ký tự',
  })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;
}

export class RegisterResponseDto {
  @ApiProperty({ example: 'a22de1e3-073b-4888-b75f-04fe72647e41' })
  user_id!: string;

  @ApiProperty({ example: 'a@gmail.com' })
  email!: string | null;
}
