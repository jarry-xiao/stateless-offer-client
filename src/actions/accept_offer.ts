import {
  SystemProgram,
  TransactionInstruction,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import { Connection as Conn } from "../contexts";
import BN, { min } from "bn.js";
import {
  notify,
  createAssociatedTokenAccountInstruction,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from "../utils";
import { Schema, serialize } from "borsh";
import { TOKEN_PROGRAM_ID, Token, NATIVE_MINT } from "@solana/spl-token";
import { STATELESS_ASK_PROGRAM_ID, TOKEN_METADATA_PROGRAM_ID } from "../utils/";
import { decodeMetadata, getTokenMetadata } from "./metadata";

export class AcceptOfferArgs {
  instruction: number = 0;
  hasMetadata: boolean;
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
          ["hasMetadata", "u8"],
          ["makerSize", "u64"],
          ["takerSize", "u64"],
          ["bumpSeed", "u8"],
        ],
      },
    ],
  ]);

  constructor(args: {
    hasMetadata: boolean;
    makerSize: BN;
    takerSize: BN;
    bumpSeed: number;
  }) {
    this.hasMetadata = args.hasMetadata;
    this.makerSize = args.makerSize;
    this.takerSize = args.takerSize;
    this.bumpSeed = args.bumpSeed;
  }
}

export const acceptOfferInstructionNoMetadata = async (
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
  let settings = new AcceptOfferArgs({
    hasMetadata: false,
    makerSize,
    takerSize,
    bumpSeed,
  });
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
  ];
  if (takerSrcMint.toBase58() === NATIVE_MINT.toBase58()) {
    keys.push({
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    });
  }
  return {
    ix: [
      new TransactionInstruction({
        keys,
        programId: STATELESS_ASK_PROGRAM_ID,
        data,
      }),
    ],
  };
};

export const acceptOfferInstructionWithMetadata = async (
  makerWallet: PublicKey,
  takerWallet: PublicKey,
  makerSrc: PublicKey,
  makerDst: PublicKey,
  takerSrc: PublicKey,
  takerDst: PublicKey,
  makerSrcMint: PublicKey,
  takerSrcMint: PublicKey,
  transferAuthority: PublicKey,
  additionalKeys: any[],
  makerSize: BN,
  takerSize: BN,
  bumpSeed: number
) => {
  let settings = new AcceptOfferArgs({
    hasMetadata: true,
    makerSize,
    takerSize,
    bumpSeed,
  });
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
  ];
  if (takerSrcMint.toBase58() === NATIVE_MINT.toBase58()) {
    keys.push({
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    });
  }
  keys.push(...additionalKeys);
  return {
    ix: [
      new TransactionInstruction({
        keys,
        programId: STATELESS_ASK_PROGRAM_ID,
        data,
      }),
    ],
  };
};

export const consolidateTokenAccounts = async (
  connection,
  mint: PublicKey,
  wallet: any,
  nonATAs: any[],
  setNonATAs: any
) => {
  if (!wallet.publicKey) {
    notify({ message: "Wallet not connected!" });
    return false;
  }
  let signers: Keypair[] = [];
  let instructions: TransactionInstruction[] = [];
  const tokenAccountMint = (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0];
  createAssociatedTokenAccountInstruction(
    instructions,
    tokenAccountMint,
    wallet.publicKey,
    wallet.publicKey,
    mint
  );
  for (const { pubkey, size } of nonATAs) {
    const transferIx = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      pubkey,
      tokenAccountMint,
      wallet.publicKey,
      [],
      size
    );
    const closeIx = Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      pubkey,
      wallet.publicKey,
      wallet.publicKey,
      []
    );
    instructions.push(...[transferIx, closeIx]);
  }
  const response = await Conn.sendTransactionWithRetry(
    connection,
    wallet,
    [...instructions],
    signers,
    "max"
  );
  if (!response) {
    notify({ message: "Consolidation Failed" });
    return false;
  } else {
    notify({
      message:
        "Successfully merged all token accounts into 1 Assoicated Token Account",
    });
    setNonATAs([]);
    return true;
  }
};

export const changeOffer = async (
  connection,
  mintA: PublicKey,
  mintB: PublicKey,
  sizeA: BN,
  sizeB: BN,
  wallet: any,
  setHasValidDelegate: any,
  setHasDelegate: any,
  metadata,
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
  tokenAccountMintB =
    mintB.toBase58() === NATIVE_MINT.toBase58()
      ? wallet.publicKey
      : tokenAccountMintB;


  const transferAuthority = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from("stateless_offer"),
        wallet.publicKey.toBuffer(),
        mintA.toBuffer(),
        mintB.toBuffer(),
        new Uint8Array(sizeA.toArray("le", 8)),
        new Uint8Array(sizeB.toArray("le", 8)),
      ],
      STATELESS_ASK_PROGRAM_ID
    )
  )[0];
  let authIx;
  if (approve) {
    authIx = Token.createApproveInstruction(
      TOKEN_PROGRAM_ID,
      tokenAccountMintA,
      transferAuthority,
      wallet.publicKey,
      [],
      sizeA.toNumber()
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
    if (approve) {
      setHasDelegate(true);
      setHasValidDelegate(true);
      notify({
        message: `Successfully assigned delegate (${transferAuthority.toBase58()})`,
      });
    } else {
      setHasDelegate(false);
      notify({
        message: `Successfully removed delegate (${transferAuthority.toBase58()})`,
      });
    }
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
  metadata,
  setHasValidDelegate,
  wallet: any
) => {
  
  for (const mint of [mintA.toBase58(), mintB.toBase58()]) {
    if (!(mint in metadata)) {
      let metadataPubkey: any = await getTokenMetadata(new PublicKey(mint));
      try {
        let result = await connection.getAccountInfo(metadataPubkey);
        if (result) {
          try {
            const meta: any = decodeMetadata(result.data);
            metadata[mint] =  { pubkey: metadataPubkey, account: meta };
          } catch {
            console.log("Failed to decode metadata for mint:", mint);
          }
        }
      } catch {
        notify({message: "Network request to fetch mint metadata failed"});
        return false;
      }
    }
  }

  let hasSellerMetadata = mintA.toBase58() in metadata;
  let hasBuyerMetadata = mintB.toBase58() in metadata;
  
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

  const isNative = mintB.toBase58() === NATIVE_MINT.toBase58();
  if (!hasATAMintB && !isNative) {
    notify({ message: "Taker must have ATA for mint B" });
    return false;
  }

  makerAccountMintB = isNative ? maker : makerAccountMintB;
  takerAccountMintB = isNative ? wallet.publicKey : takerAccountMintB;
  const [transferAuthority, bump] = await PublicKey.findProgramAddress(
    [
      Buffer.from("stateless_offer"),
      maker.toBuffer(),
      mintA.toBuffer(),
      mintB.toBuffer(),
      new Uint8Array(sizeA.toArray("le", 8)),
      new Uint8Array(sizeB.toArray("le", 8)),
    ],
    STATELESS_ASK_PROGRAM_ID
  );

  let response;
  let paidCreatorFees = "";
  if (!hasBuyerMetadata && !hasSellerMetadata) {
    let { ix } = await acceptOfferInstructionNoMetadata(
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
    console.log("Executing trade (pure swap)");
    response = await Conn.sendTransactionWithRetry(
      connection,
      wallet,
      [...ataIx, ...tradeIx],
      signers,
      "max"
    );
  } else if (metadata) {
    try {
      let nftMint;
      let feeMint;
      if (mintA.toBase58() in metadata) {
        nftMint = mintA;
        feeMint = mintB;
      } else if (mintB.toBase58() in metadata) {
        nftMint = mintB;
        feeMint = mintA;
      } else {
        notify( {message: "Neither seller or buyer mint has valid metadata"} )
        return false;
      }

      let additionalKeys: any[] = [];
      const creators = metadata[nftMint.toBase58()].account.data.creators;
      if (!creators) {
        notify({
          message:
            "Trade transaction failed: specified metadata has invalid creators",
        });
        return false;
      }
      const metadataPubkey = metadata[nftMint.toBase58()].pubkey;
      if (!metadataPubkey) {
        notify({
          message: "Trade transaction failed: metadata account is undefined",
        });
        return false;
      }
      additionalKeys.push({
        pubkey: metadataPubkey,
        isSigner: false,
        isWritable: false,
      });
      for (const creator of creators) {
        const creatorPubkey = new PublicKey(creator.address);
        additionalKeys.push({
          pubkey: creatorPubkey,
          isSigner: false,
          isWritable: true,
        });
        if (!isNative) {
          let creatorTokenAccount = (
            await PublicKey.findProgramAddress(
              [
                creatorPubkey.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                feeMint.toBuffer(),
              ],
              SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
            )
          )[0];
          const hasATACreator = await connection.getAccountInfo(
            creatorTokenAccount
          );
          if (!hasATACreator) {
            createAssociatedTokenAccountInstruction(
              ataIx,
              creatorTokenAccount,
              wallet.publicKey,
              creatorPubkey,
              feeMint, 
            );
          }
          additionalKeys.push({
            pubkey: creatorTokenAccount,
            isSigner: false,
            isWritable: true,
          });
        }
      }
      let { ix } = await acceptOfferInstructionWithMetadata(
        maker,
        wallet.publicKey,
        makerAccountMintA,
        makerAccountMintB,
        takerAccountMintB,
        takerAccountMintA,
        mintA,
        mintB,
        transferAuthority,
        additionalKeys,
        sizeA,
        sizeB,
        bump
      );
      const tradeIx = ix;
      console.log("Executing trade (metadata and creators supplied)")
      response = await Conn.sendTransactionWithRetry(
        connection,
        wallet,
        [...ataIx, ...tradeIx],
        signers,
        "max"
      );
      paidCreatorFees = " (Creator Fees Paid)";
    } catch (e) {
      console.log(e);
      console.log("Encountered error while processing metadata");
    }
  }

  if (!response) {
    notify({ message: "Trade transaction failed" });
    return false;
  } else {
    notify({ message: `Trade successful${paidCreatorFees}` });
    setHasValidDelegate(false);
    return true;
  }
};
