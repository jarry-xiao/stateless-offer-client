import {
  SystemProgram,
  TransactionInstruction,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { Connection as Conn } from "../contexts";
import BN from "bn.js";
import {
  notify,
  createAssociatedTokenAccountInstruction,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from "../utils";
import { Schema, serialize } from "borsh";
import { TOKEN_PROGRAM_ID, Token, NATIVE_MINT } from "@solana/spl-token";

// Hard-coded devnet key for now
export const PROGRAM_ID = new PublicKey(
  "61FqXyzpmGLf8tMTjHbaL1fUwM277tMJEV7dyPsySaa6"
);

export class AcceptOfferArgs {
  instruction: number = 0;
  makerSize: BN;
  takerSize: BN;
  bumpSeed: number;

  static schema: Schema = new Map([
    [
      AcceptOfferArgs,
      {
        kind: "struct",
        fields: [
          ["instruction", "u8"],
          ["makerSize", "u64"],
          ["takerSize", "u64"],
          ["bumpSeed", "u8"],
        ],
      },
    ],
  ]);

  constructor(args: { makerSize: BN; takerSize: BN; bumpSeed: number }) {
    this.makerSize = args.makerSize;
    this.takerSize = args.takerSize;
    this.bumpSeed = args.bumpSeed;
  }
}

export const acceptOfferInstruction = async (
  makerWallet: PublicKey,
  takerWallet: PublicKey,
  makerSrc: PublicKey,
  makerDst: PublicKey,
  takerSrc: PublicKey,
  takerDst: PublicKey,
  makerSrcMint: PublicKey,
  takerSrcMint: PublicKey,
  transferAuthority: PublicKey,
  makerSize: BN,
  takerSize: BN,
  bumpSeed: number
) => {
  let settings = new AcceptOfferArgs({ makerSize, takerSize, bumpSeed });
  const data = Buffer.from(serialize(AcceptOfferArgs.schema, settings));
  let keys = [
    {
      pubkey: makerWallet,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: takerWallet,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: makerSrc,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: makerDst,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: takerSrc,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: takerDst,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: makerSrcMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: takerSrcMint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: transferAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ]
  if (takerSrcMint.toBase58() === NATIVE_MINT.toBase58()) {
    keys.push(
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      }
    )
  }
  return {
    ix: [
      new TransactionInstruction({
        keys,
        programId: PROGRAM_ID,
        data,
      }),
    ],
  };
};

export const changeOffer = async (
  connection,
  mintA: PublicKey,
  mintB: PublicKey,
  sizeA: BN,
  sizeB: BN,
  wallet: any,
  approve = true
) => {
  if (!wallet.publicKey) {
    notify({ message: "Wallet not connected!" });
    return false;
  }
  let signers: Keypair[] = [];
  let ataIx: TransactionInstruction[] = [];

  const tokenAccountMintA = (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintA.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];

  const hasATAMintA = await connection.getAccountInfo(tokenAccountMintA);
  if (!hasATAMintA) {
    notify({ message: "User must have ATA to create offer" });
    return false;
  }

  let tokenAccountMintB = (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintB.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];

  const hasATAMintB = await connection.getAccountInfo(tokenAccountMintB);
  if (!hasATAMintB) {
    createAssociatedTokenAccountInstruction(
      ataIx,
      tokenAccountMintB,
      wallet.publicKey,
      wallet.publicKey,
      mintB
    );
  }
  tokenAccountMintB = mintB.toBase58() === NATIVE_MINT.toBase58() ? wallet.publicKey : tokenAccountMintB;
  const [transferAuthority, bump] = await PublicKey.findProgramAddress(
    [
      Buffer.from("stateless_offer"),
      wallet.publicKey.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
      new Uint8Array(sizeA.toArray("le", 8)),
      new Uint8Array(sizeB.toArray("le", 8)),
    ],
    PROGRAM_ID
  );
  let authIx;
  if (approve) {
    authIx = Token.createApproveInstruction(
      TOKEN_PROGRAM_ID,
      tokenAccountMintA,
      transferAuthority,
      wallet.publicKey,
      [],
      sizeA.toNumber(),
    );
  } else {
    authIx = Token.createRevokeInstruction(
      TOKEN_PROGRAM_ID,
      tokenAccountMintA,
      wallet.publicKey,
      []
    );
  }
  const response = await Conn.sendTransactionWithRetry(
    connection,
    wallet,
    [...ataIx, authIx],
    signers,
    "max"
  );
  if (!response) {
    notify({ message: "Delegation transaction failed" });
    return false;
  } else {
    return true;
  }
};

export const trade = async (
  connection,
  maker: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  sizeA: BN,
  sizeB: BN,
  wallet: any,
) => {
  if (!wallet.publicKey) {
    notify({ message: "Wallet not connected!" });
    return false;
  }
  let signers: Keypair[] = [];
  let ataIx: TransactionInstruction[] = [];

  const makerAccountMintA = (
    await PublicKey.findProgramAddress(
      [maker.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintA.toBuffer()],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];

  if (!(await connection.getAccountInfo(makerAccountMintA))) {
    notify({ message: "Maker must have ATA for mint A" });
    return false;
  }

  let makerAccountMintB = (
    await PublicKey.findProgramAddress(
      [maker.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintB.toBuffer()],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];

  if (!(await connection.getAccountInfo(makerAccountMintB))) {
    notify({ message: "Maker must have ATA for mint B" });
    return false;
  }

  const takerAccountMintA = (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintA.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];

  const hasATAMintA = await connection.getAccountInfo(takerAccountMintA);
  if (!hasATAMintA) {
    createAssociatedTokenAccountInstruction(
      ataIx,
      takerAccountMintA,
      wallet.publicKey,
      wallet.publicKey,
      mintA
    );
  }

  let takerAccountMintB = (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintB.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];

  const hasATAMintB = await connection.getAccountInfo(
    new PublicKey(takerAccountMintB)
  );
  console.log(mintB.toBase58())
  console.log(NATIVE_MINT)
  if (!hasATAMintB && mintB.toBase58() != NATIVE_MINT.toBase58()) {
    notify({ message: "Taker must have ATA for mint B" });
    return false;
  }

  makerAccountMintB = mintB.toBase58() === NATIVE_MINT.toBase58() ? maker : makerAccountMintB;
  takerAccountMintB =  mintB.toBase58() === NATIVE_MINT.toBase58() ? wallet.publicKey : takerAccountMintB;
  const [transferAuthority, bump] = await PublicKey.findProgramAddress(
    [
      Buffer.from("stateless_offer"),
      maker.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
      new Uint8Array(sizeA.toArray("le", 8)),
      new Uint8Array(sizeB.toArray("le", 8)),
    ],
    PROGRAM_ID
  );

  let { ix } = await acceptOfferInstruction(
    maker,
    wallet.publicKey,
    makerAccountMintA,
    makerAccountMintB,
    takerAccountMintB,
    takerAccountMintA,
    mintA,
    mintB,
    transferAuthority,
    sizeA,
    sizeB,
    bump
  );
  const tradeIx = ix;

  const response = await Conn.sendTransactionWithRetry(
    connection,
    wallet,
    [...ataIx, ...tradeIx],
    signers,
    "max"
  );
  if (!response) {
    notify({ message: "Trade transaction failed" });
    return false;
  } else {
    return true;
  }
};
