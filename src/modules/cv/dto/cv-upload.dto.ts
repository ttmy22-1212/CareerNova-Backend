import { ApiProperty } from '@nestjs/swagger';

export class FileUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File CV (PDF, DOC, DOCX)',
  })
  file: any;
}
