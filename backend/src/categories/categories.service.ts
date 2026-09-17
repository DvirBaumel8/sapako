import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { ProvidersService } from '../providers/providers.service';
import { isUniqueViolation } from '../database/uniqueViolation';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    private readonly providersService: ProvidersService,
  ) {}

  async create(providerId: string, input: { name: string }): Promise<Category> {
    // Confirms the provider exists before inserting — same failure mode
    // already fixed elsewhere (grantAccess, product/department create):
    // otherwise an invalid providerId surfaces as an unhandled FK-violation
    // 500 instead of a clean 404.
    await this.providersService.findById(providerId);
    // No check-then-insert here: two requests naming the same category at
    // once could both pass a pre-check before either had inserted, leaving
    // the database's own UNIQUE("providerId", name) constraint to reject
    // the second — as an unhandled 500, since nothing caught it. Inserting
    // straight away and catching that violation closes the race instead of
    // narrowing it.
    try {
      return await this.categoriesRepo.manager.transaction(async (manager) => {
        const entity = manager.create(Category, { providerId, ...input });
        return manager.save(entity);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A category with this name already exists for this provider',
        );
      }
      throw error;
    }
  }

  findAllForProvider(providerId: string): Promise<Category[]> {
    // Explicit order: Postgres makes no row-order guarantee without one, and
    // creation order is what keeps the list stable across requests instead
    // of visibly reshuffling.
    return this.categoriesRepo.find({
      where: { providerId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoriesRepo.findOneBy({ id });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(id: string, input: { name: string }): Promise<Category> {
    const category = await this.findById(id);
    if (input.name !== category.name) {
      const existing = await this.categoriesRepo.findOneBy({
        providerId: category.providerId,
        name: input.name,
      });
      if (existing) {
        throw new ConflictException(
          'A category with this name already exists for this provider',
        );
      }
    }
    category.name = input.name;
    return this.categoriesRepo.save(category);
  }

  async remove(id: string): Promise<void> {
    // products.categoryId is SET NULL on delete, so this un-sorts its
    // products into "uncategorized" rather than touching them otherwise.
    const result = await this.categoriesRepo.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException('Category not found');
    }
  }
}
