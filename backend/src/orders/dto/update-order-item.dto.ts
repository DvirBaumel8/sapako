import { IsInt, IsPositive } from 'class-validator';

export class UpdateOrderItemDto {
  @IsInt()
  @IsPositive()
  quantity: number;
}
