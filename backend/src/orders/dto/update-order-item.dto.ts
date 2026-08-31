import { IsNumber, IsPositive } from 'class-validator';

export class UpdateOrderItemDto {
  // Not IsInt: weight units are fractional. Two decimal places matches the
  // column, and IsPositive still rejects zero and negatives.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;
}
