import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectionTestResponseDto {
  @ApiProperty({ description: 'Whether the connection test succeeded' })
  success: boolean;

  @ApiProperty({ description: 'Status message describing the result' })
  message: string;

  @ApiPropertyOptional({ description: 'Model used for the test', example: 'gpt-4o-mini' })
  model?: string;

  @ApiPropertyOptional({ description: 'Response latency in milliseconds', example: 245 })
  latencyMs?: number;

  @ApiPropertyOptional({ description: 'Error details if the test failed' })
  error?: string;
}
