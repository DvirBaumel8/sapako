import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  providerId: string;
}
