import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Store } from './store.entity';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { ScopeService } from '../common/scope.service';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storesRepo: Repository<Store>,
    private readonly scopeService: ScopeService,
  ) {}

  async findAll(userId: string): Promise<Store[]> {
    const scope = await this.scopeService.resolve(userId);
    return this.storesRepo.find({
      where: this.scopeService.whereFragment(scope) as FindOptionsWhere<Store>,
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Store> {
    const scope = await this.scopeService.resolve(userId);
    const store = await this.storesRepo.findOne({
      where: {
        ...(this.scopeService.whereFragment(scope) as FindOptionsWhere<Store>),
        id,
      },
    });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return store;
  }

  async create(userId: string, dto: CreateStoreDto): Promise<Store> {
    const scope = await this.scopeService.resolve(userId);
    const store = this.storesRepo.create({
      ...dto,
      userId,
      householdId: scope.householdId,
    });
    return this.storesRepo.save(store);
  }

  async update(id: string, userId: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOne(id, userId);
    Object.assign(store, dto);
    return this.storesRepo.save(store);
  }

  async remove(id: string, userId: string): Promise<void> {
    const store = await this.findOne(id, userId);
    await this.storesRepo.remove(store);
  }
}
