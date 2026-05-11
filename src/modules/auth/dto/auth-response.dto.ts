import { ApiProperty } from '@nestjs/swagger';

class UserInfo {
  @ApiProperty({ example: '123-uuid-456' })
  user_id!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  full_name!: string | null;

  @ApiProperty({ example: 'a@gmail.com' })
  email!: string | null;

  @ApiProperty({ example: null, nullable: true })
  avatar_url!: string | null;

  @ApiProperty({ example: 'student' })
  role!: string;
}

class AuthResultDto {
  @ApiProperty({ type: UserInfo })
  @ApiProperty({ example: 'jwt-access-token-string' })
  access_token!: string;

  @ApiProperty({ example: 'jwt-refresh-token-string' })
  refresh_token!: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthResultDto })
  data!: AuthResultDto;
}
