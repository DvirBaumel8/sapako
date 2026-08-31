import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Provider } from '../providers/provider.entity';

/** An exception: denies a provider the user would otherwise reach. */
@Entity('user_provider_block')
export class UserProviderBlock {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  providerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;
}
