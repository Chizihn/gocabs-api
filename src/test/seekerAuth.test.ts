import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { buildSchema } from 'type-graphql';
import { prisma } from '../config/database';
import { NFTVerificationService } from '../services/blockchain/NFTVerificationService';
import { UserResolver } from '../resolvers/UserResolver';
import { EventResolver } from '../resolvers/EventResolver';
import { ShuttleResolver } from '../resolvers/ShuttleResolver';
import { BookingResolver } from '../resolvers/BookingResolver';
import { StakingResolver } from '../resolvers/StakingResolver';
import { RewardResolver } from '../resolvers/RewardResolver';
import { FleetAuthResolver } from '../resolvers/FleetAuthResolver';
import { DriverResolver } from '../resolvers/DriverResolver';
import { OwnerResolver } from '../resolvers/OwnerResolver';
import { NotificationResolver } from '../resolvers/NotificationResolver';
import { AdminResolver } from '../resolvers/AdminResolver';

jest.mock('../services/blockchain/NFTVerificationService');
const mockedNFTVerificationService =
  NFTVerificationService as jest.Mocked<any>;

interface ConnectWalletResponse {
  connectWallet: {
    token: string;
    user: {
      id: string;
      walletAddress: string;
    };
    hasNFTAccess: boolean;
  };
}

interface RefreshNFTStatusResponse {
  refreshNFTStatus: {
    hasAccess: boolean;
    tokens: {
      tokenMint: string;
    }[];
  };
}

describe('UserResolver - Seeker Authentication', () => {
  let server: ApolloServer;

  beforeAll(async () => {
    const schema = await buildSchema({
      resolvers: [
        UserResolver,
        EventResolver,
        ShuttleResolver,
        BookingResolver,
        StakingResolver,
        RewardResolver,
        FleetAuthResolver,
        DriverResolver,
        OwnerResolver,
        NotificationResolver,
        AdminResolver,
      ],
    });
    server = new ApolloServer({
      schema,
    });
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
  });

  it('should connect a new user with NFT access', async () => {
    const walletAddress = 'test-wallet-address-with-nft';
    mockedNFTVerificationService.hasNFTAccess.mockResolvedValue({
      hasAccess: true,
      reason: 'owns_nft',
    });

    const CONNECT_WALLET = `
      mutation {
        connectWallet(walletAddress: "${walletAddress}") {
          token
          user {
            id
            walletAddress
          }
          hasNFTAccess
        }
      }
    `;

    const response = await server.executeOperation({
      query: CONNECT_WALLET,
    });

    if (response.body.kind === 'single') {
      const data = response.body.singleResult.data as ConnectWalletResponse;
      expect(data.connectWallet.token).toBeDefined();
      expect(data.connectWallet.user.walletAddress).toBe(
        walletAddress
      );
      expect(data.connectWallet.hasNFTAccess).toBe(true);
    }

    const userInDb = await prisma.user.findUnique({
      where: { walletAddress },
    });
    expect(userInDb).toBeDefined();
  });

  it('should connect a new user without NFT access (teaser mode)', async () => {
    const walletAddress = 'test-wallet-address-no-nft';
    mockedNFTVerificationService.hasNFTAccess.mockResolvedValue({
      hasAccess: false,
      reason: 'none',
    });

    const CONNECT_WALLET = `
      mutation {
        connectWallet(walletAddress: "${walletAddress}") {
          token
          user {
            id
            walletAddress
          }
          hasNFTAccess
        }
      }
    `;

    const response = await server.executeOperation({
      query: CONNECT_WALLET,
    });

    if (response.body.kind === 'single') {
      const data = response.body.singleResult.data as ConnectWalletResponse;
      expect(data.connectWallet.token).toBeDefined();
      expect(data.connectWallet.user.walletAddress).toBe(
        walletAddress
      );
      expect(data.connectWallet.hasNFTAccess).toBe(false);
    }

    const userInDb = await prisma.user.findUnique({
      where: { walletAddress },
    });
    expect(userInDb).toBeDefined();
  });

  it('should connect an existing user and update their NFT access status', async () => {
    const walletAddress = 'existing-user-wallet';
    await prisma.user.create({
      data: {
        walletAddress,
        role: 'SEEKER',
      },
    });

    mockedNFTVerificationService.hasNFTAccess.mockResolvedValue({
      hasAccess: true,
      reason: 'owns_nft',
    });

    const CONNECT_WALLET = `
      mutation {
        connectWallet(walletAddress: "${walletAddress}") {
          token
          hasNFTAccess
        }
      }
    `;

    const response = await server.executeOperation({
      query: CONNECT_WALLET,
    });

    if (response.body.kind === 'single') {
      const data = response.body.singleResult.data as ConnectWalletResponse;
      expect(data.connectWallet.token).toBeDefined();
      expect(data.connectWallet.hasNFTAccess).toBe(true);
    }
  });

  it('should refresh NFT status and return the correct token list', async () => {
    const walletAddress = 'test-wallet-for-refresh';
    const user = await prisma.user.create({
      data: {
        walletAddress,
        role: 'SEEKER',
      },
    });

    mockedNFTVerificationService.invalidateCache.mockResolvedValue(undefined);
    mockedNFTVerificationService.verifyNFTOwnership.mockResolvedValue({
      isHolder: true,
      nftTokens: ['nft-mint-1', 'nft-mint-2'],
    });

    const REFRESH_NFT_STATUS = `
      mutation {
        refreshNFTStatus {
          hasAccess
          tokens {
            tokenMint
          }
        }
      }
    `;

    const response = await server.executeOperation(
      {
        query: REFRESH_NFT_STATUS,
      },
      {
        contextValue: {
          userId: user.id,
          walletAddress: user.walletAddress,
        },
      }
    );

    if (response.body.kind === 'single') {
      const data = response.body.singleResult.data as RefreshNFTStatusResponse;
      expect(mockedNFTVerificationService.invalidateCache).toHaveBeenCalledWith(walletAddress);
      expect(data.refreshNFTStatus.hasAccess).toBe(true);
      expect(data.refreshNFTStatus.tokens).toHaveLength(2);
      expect(data.refreshNFTStatus.tokens).toEqual([
        { tokenMint: 'nft-mint-1' },
        { tokenMint: 'nft-mint-2' },
      ]);
    }
  });
});
