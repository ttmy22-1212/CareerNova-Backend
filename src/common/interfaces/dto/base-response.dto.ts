import { ApiProperty } from '@nestjs/swagger';

export class BaseResponseDto<T> {
  @ApiProperty()
  data!: T;

  @ApiProperty({ required: false })
  message?: string;
}
