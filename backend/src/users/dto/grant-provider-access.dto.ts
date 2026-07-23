import { IsNotEmpty, IsUUID } from 'class-validator';

export class GrantProviderAccessDto {
  @IsUUID()
  @IsNotEmpty()
  providerId: string;
}
