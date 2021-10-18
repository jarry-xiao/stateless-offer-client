import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import {
  Select,
  FormControl,
  OutlinedInput,
  InputLabel,
  MenuItem,
  Input,
} from "@mui/material";
import LoadingButton from "@mui/lab/LoadingButton";
import TextField from "@mui/material/TextField";
import {
  useConnection,
  deserializeAccount,
  deserializeMint,
  useConnectionConfig,
} from "../../contexts";
import { SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID } from "../../utils";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import {
  changeOffer,
  consolidateTokenAccounts,
  trade,
} from "../../actions/accept_offer";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { ENV, TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import Popover from "@mui/material/Popover";
import {
  STATELESS_ASK_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
} from "../../utils/";
import {
  decodeMetadata,
  Metadata,
  getTokenMetadata,
} from "../../actions/metadata";
import { isNative } from "lodash";

const MINTS = ["None", "SOL", "USDC", "USDT", "BTC", "ETH"];

const getSize = (n: any, mint: any, mintCache: any) => {
  try {
    const dec = mintCache[mint].decimals;
    const size = Math.floor(parseFloat(n) * Math.pow(10, dec));
    return size;
  } catch {
    return 0;
  }
};

const getFees = (formState, metadata) => {
  try {
    if (formState.mintA in metadata) {
      const fees = metadata[formState.mintA].account.data.sellerFeeBasisPoints;
      const size = parseFloat(formState.sizeB);
      return [true, size, (size * fees) / 10000, fees];
    } else if (formState.mintB in metadata) {
      const fees = metadata[formState.mintB].account.data.sellerFeeBasisPoints;
      const size = parseFloat(formState.sizeA);
      return [false, size, (size * fees) / 10000, fees];
    } else {
      return [true, 0, 0, 0];
    }
  } catch {
    return [true, 0, 0, 0];
  }
};

const displayFees = (isSeller, formState, metadata) => {
  // const creator
  const [isSellerNFT, size, feeAmount, fees] = getFees(formState, metadata);
  const isFeePayer = (isSellerNFT && !isSeller) || (!isSellerNFT && isSeller);
  if (fees <= 0) return null;

  const feePct = (fees / 100).toFixed(2);
  if (isFeePayer) {
    const side = !isSellerNFT ? "Seller" : "Buyer";
    return (
      <div
        style={{
          marginLeft: "12px",
          marginTop: "2px",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        {`* ${side} will pay a ${feePct}% fee on trade (pays ~${feeAmount.toFixed(
          4
        )})`}
      </div>
    );
  } else {
    const side = isSellerNFT ? "Seller" : "Buyer";
    return (
      <div
        style={{
          marginLeft: "12px",
          marginTop: "2px",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        {`* ${side} will receive ${feePct}% less on trade due to fees (receives ~${(
          size - feeAmount
        ).toFixed(4)})`}
      </div>
    );
  }
};

const getDelegate = async (formState: any, mintCache: any, metadata) => {
  try {
    const sizeA = getSize(formState.sizeA, formState.mintA, mintCache);
    const sizeB = getSize(formState.sizeB, formState.mintB, mintCache);
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from("stateless_offer"),
          new PublicKey(formState.maker).toBuffer(),
          new PublicKey(formState.mintA).toBuffer(),
          new PublicKey(formState.mintB).toBuffer(),
          new Uint8Array(new BN(sizeA).toArray("le", 8)),
          new Uint8Array(new BN(sizeB).toArray("le", 8)),
        ],
        STATELESS_ASK_PROGRAM_ID
      )
    )[0];
  } catch (e) {
    console.log("Failed to get delegate. Metadata:", metadata);
    return null;
  }
};

const getExplorerLink = (env, formState, mint) => {
  if (env && formState && formState[mint]) {
    let url = `https://explorer.solana.com/address/${formState[mint]}?cluster=${env}`;
    return window.open(url, "_blank");
  }
  return false;
};

const getDefaultFormState = () => {
  let url = new URL(window.location.href);
  let params = new URLSearchParams(url.search.slice(1));
  let defaultState = {
    mintA: "",
    mintB: "",
    sizeA: "0",
    sizeB: "0",
    maker: "",
  };
  for (const key of params.keys()) {
    defaultState[key] = params.get(key);
  }
  return defaultState;
};

export function TransferBox() {
  const connection = useConnection();
  const wallet = useWallet();
  const { env } = useConnectionConfig();
  const [formState, setFormState] = useState(getDefaultFormState());
  const [accountState, setAccountState] = useState({});
  const [buyerAccountState, setBuyerAccountState] = useState({});
  const [mintCache, setMintCache] = useState({});
  const [buyerLamports, setBuyerLamports] = useState(0);
  const [isSeller, setIsSeller] = useState(false);
  const [validAmount, setValidAmount] = useState(false);
  const [hasDelegate, setHasDelegate] = useState(false);
  const [hasValidDelegate, setHasValidDelegate] = useState(false);
  const [openA, setOpenA] = useState(false);
  const [openB, setOpenB] = useState(false);
  const [nonATAs, setNonATAs] = useState([]);
  const [anchorElA, setAnchorElA] = useState(null);
  const [anchorElB, setAnchorElB] = useState(null);
  const [openPopA, setOpenPopA] = useState(false);
  const [openPopB, setOpenPopB] = useState(false);
  let inputClicked = false;
  const [metadata, setMetadata] = useState({});
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map());

  useEffect(() => {
    console.log("RESET");
    if (!wallet.connected) {
      console.log("Wallet disconnected, resetting state");
      setBuyerAccountState({});
      setIsSeller(false);
      setValidAmount(false);
      setMintCache({});
      setHasDelegate(false);
      setHasValidDelegate(false);
    }
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => {
    console.log("TOKEN LOOKUP");
    new TokenListProvider().resolve().then((tokens) => {
      let tokenList;
      if (env === "devnet") {
        tokenList = tokens.filterByChainId(ENV.Devnet).getList();
      } else if (env === "mainnet-beta") {
        tokenList = tokens.filterByChainId(ENV.MainnetBeta).getList();
      } else if (env === "testnet") {
        tokenList = tokens.filterByChainId(ENV.Testnet).getList();
      }
      setTokenMap(
        tokenList.reduce((map, item) => {
          map.set(item.symbol, item);
          return map;
        }, new Map())
      );
    });
  }, [setTokenMap, env]);

  useEffect(() => {
    console.log("SET SELLER");
    if (!wallet) {
      return;
    }
    setIsSeller(wallet.publicKey?.toBase58() === formState.maker);
  }, [formState.maker, wallet, setIsSeller]);

  useEffect(() => {
    console.log("VALIDATE TOKEN ACCOUNT");
    const validate = async () => {
      const tokenAccount: any = accountState;
      if (!tokenAccount.mint) {
        return;
      }
      const mint = tokenAccount.mint.toBase58();
      if (mint in mintCache) {
        const dec = mintCache[mint].decimals;
        const totalAmount = tokenAccount.amount * Math.pow(10, -dec);
        try {
          const size = parseFloat(formState.sizeA);
          setValidAmount(totalAmount >= size && size > 0);
        } catch {
          console.log("Not a valid float");
        }
      }
      const delegate = await getDelegate(
        formState,
        mintCache,
        metadata[formState.mintA]
      );
      setHasDelegate(tokenAccount.delegateOption !== 0);
      if (
        tokenAccount.delegate &&
        delegate &&
        tokenAccount.delegateOption !== 0 &&
        delegate.toBase58() === tokenAccount.delegate.toBase58()
      ) {
        setHasValidDelegate(true);
      } else {
        setHasValidDelegate(false);
      }
    };
    validate();
  }, [accountState, mintCache, formState, metadata]);

  useEffect(() => {
    console.log("FETCH SELLER TOKEN ACCOUNT");
    let subId;
    if (!wallet.connected) {
      return;
    }
    const fetchAccountState = async () => {
      let sellerWallet;
      let sellerMint;
      try {
        sellerWallet = new PublicKey(formState.maker);
        sellerMint = new PublicKey(formState.mintA);
      } catch (e) {
        return;
      }
      let sellerTokenAccount = (
        await PublicKey.findProgramAddress(
          [
            sellerWallet.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            sellerMint.toBuffer(),
          ],
          SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
        )
      )[0];
      const result = await connection.getAccountInfo(sellerTokenAccount);
      if (result) {
        try {
          const tokenAccount = deserializeAccount(result.data);
          setAccountState(tokenAccount);
        } catch (e) {
          console.log("Failed to deserialize account");
        }
      } else {
        let sellerTokenAccounts;
        try {
          sellerTokenAccounts = await connection.getTokenAccountsByOwner(
            sellerWallet,
            { mint: sellerMint }
          );
        } catch {
          return;
        }
        if (sellerTokenAccounts.value) {
          let badAccounts: any = [];
          for (const account of sellerTokenAccounts.value) {
            try {
              const size = deserializeAccount(account.account.data).amount;
              badAccounts.push({ pubkey: account.pubkey, size: size });
            } catch (e) {
              console.log("Failed to deserialize account", e);
            }
          }
          console.log(badAccounts);
          setNonATAs(badAccounts);
        }
      }
      subId = connection.onAccountChange(sellerTokenAccount, async (result) => {
        if (result) {
          console.log("Received account data");
          try {
            const tokenAccount = deserializeAccount(result.data);
            setAccountState(tokenAccount);
          } catch (e) {
            console.log("Failed to deserialize account", e);
          }
        }
      });
    };
    fetchAccountState();
    return () => {
      if (subId) connection.removeAccountChangeListener(subId);
    };
  }, [
    formState.maker,
    formState.mintA,
    connection,
    setAccountState,
    wallet.connected,
  ]);

  useEffect(() => {
    console.log("FETCH BUYER TOKEN ACCOUNT");
    let subId;
    if (!wallet.connected || !wallet.publicKey) {
      console.log("Wallet disconnected, can't fetch buyer token account");
      return;
    }
    const fetchAccountState = async () => {
      let buyerWallet;
      let buyerMint;
      try {
        buyerWallet = wallet.publicKey;
        buyerMint = new PublicKey(formState.mintB);
      } catch (e) {
        return;
      }
      try {
        let walletResult = await connection.getAccountInfo(buyerWallet);
        if (walletResult) {
          setBuyerLamports(walletResult.lamports);
        }
      } catch {
        console.log("Failed to fetch wallet");
      }
      let buyerTokenAccount = (
        await PublicKey.findProgramAddress(
          [
            buyerWallet.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            buyerMint.toBuffer(),
          ],
          SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
        )
      )[0];
      let result;
      try {
        result = await connection.getAccountInfo(buyerTokenAccount);
      } catch {
        console.log("Failed to fetch Buyer ATA");
      }
      if (result) {
        try {
          const tokenAccount = deserializeAccount(result.data);
          setBuyerAccountState(tokenAccount);
        } catch (e) {
          console.log("Failed to deserialize account");
        }
      } else {
        let buyerTokenAccounts;
        try {
          buyerTokenAccounts = await connection.getTokenAccountsByOwner(
            buyerWallet,
            { mint: buyerMint }
          );
        } catch {
          return;
        }
        if (buyerTokenAccounts.value) {
          let badAccounts: any = [];
          for (const account of buyerTokenAccounts.value) {
            try {
              const size = deserializeAccount(account.account.data).amount;
              badAccounts.push({ pubkey: account.pubkey, size: size });
            } catch (e) {
              console.log("Failed to deserialize account", e);
            }
          }
          setNonATAs(badAccounts);
        }
      }
      subId = connection.onAccountChange(buyerTokenAccount, async (result) => {
        if (result) {
          console.log("Received account data");
          try {
            const tokenAccount = deserializeAccount(result.data);
            setBuyerAccountState(tokenAccount);
          } catch (e) {
            console.log("Failed to deserialize account", e);
          }
        }
      });
    };
    fetchAccountState();
    return () => {
      if (subId) connection.removeAccountChangeListener(subId);
    };
  }, [
    formState.maker,
    formState.mintB,
    connection,
    setBuyerAccountState,
    wallet.publicKey,
    wallet.connected,
  ]);

  useEffect(() => {
    console.log("FETCH MINT ACCOUNTS");
    if (!wallet.connected) {
      return;
    }
    const fetchMintState = async () => {
      let mint;
      for (const mintString of [formState.mintA, formState.mintB]) {
        try {
          mint = new PublicKey(mintString);
        } catch (e) {
          continue;
        }
        if (!(mint.toBase58() in mintCache)) {
          let result = await connection.getAccountInfo(mint);
          if (result) {
            try {
              const mintData = deserializeMint(result.data);
              setMintCache({
                ...mintCache,
                [mintString]: mintData,
              });
            } catch {
              continue;
            }
          }
        }
      }
    };
    fetchMintState();
  }, [
    mintCache,
    formState.mintA,
    formState.mintB,
    connection,
    wallet.connected,
  ]);

  useEffect(() => {
    console.log("FETCH METADATA ACCOUNTS");
    if (!wallet.connected) {
      return;
    }
    const getMetadata = async () => {
      for (const mint of [formState.mintA, formState.mintB]) {
        if (!(mint in mintCache)) {
          return;
        }
        if (mint in metadata) {
          return;
        }
        const metadataPubkey: any = await getTokenMetadata(new PublicKey(mint));
        const result = await connection.getAccountInfo(metadataPubkey);
        if (result) {
          try {
            const meta: any = decodeMetadata(result.data);
            setMetadata({
              ...metadata,
              [mint]: { pubkey: metadataPubkey, account: meta },
            });
            break;
          } catch {
            continue;
          }
        }
      }
    };
    getMetadata();
  }, [
    mintCache,
    formState.mintA,
    formState.mintB,
    setMetadata,
    connection,
    wallet.connected,
  ]);

  const setField = (name: any) => {
    const setFieldWithName = (e) => {
      setFormState({ ...formState, [name]: e.target.value });
      let url = new URL(window.location.href);
      let params = new URLSearchParams(url.search.slice(1));
      params.set(name, escape(e.target.value));
      let newUrl =
        window.location.protocol +
        "//" +
        window.location.host +
        window.location.pathname +
        "?" +
        params.toString();
      window.history.pushState({ path: newUrl }, "", newUrl);
    };
    return setFieldWithName;
  };

  const getField = (name: any) => {
    if (name in formState) {
      return formState[name];
    }
  };

  const handleEnter = (e) => {
    if (e.key === "Enter") {
      setOpenA(false);
      setOpenB(false);
    }
  };

  const handlePopoverOpenA = (e) => {
    setAnchorElA(e.currentTarget);
    setOpenPopA(true);
  };

  const handlePopoverCloseA = (e) => {
    setAnchorElA(null);
    setOpenPopA(false);
  };

  const handlePopoverOpenB = (e) => {
    setAnchorElB(e.currentTarget);
    setOpenPopB(true);
  };

  const handlePopoverCloseB = (e) => {
    setAnchorElB(null);
    setOpenPopB(false);
  };

  const getTokenKeys = (tokenMap, mintStr) => {
    let keys: any[] = [];
    keys.push(
      <Input
        key={mintStr}
        onKeyPress={handleEnter}
        inputProps={{
          sx: { marginLeft: "15px" },
          value: getField(mintStr),
          placeholder:
            "Enter the desired mint public key (or select from known mints)",
        }}
        value={getField(mintStr)}
        fullWidth
        onChange={(e) => {
          setField(mintStr)(e);
        }}
        onClick={(e) => {
          inputClicked = true;
        }} // necessary?
        onKeyDown={(e) => e.stopPropagation()} // necessary?
      ></Input>
    );
    for (const mint of MINTS) {
      if (!tokenMap.get(mint)) {
        if (mint === "None") {
          keys.push(
            <MenuItem key={mint} value="" sx={{ fontStyle: "italic" }}>
              {mint}
            </MenuItem>
          );
        }
        continue;
      }
      keys.push(
        <MenuItem key={mint} value={tokenMap.get(mint).address}>
          {mint}
        </MenuItem>
      );
    }
    return keys;
  };

  const displayActions = () => {
    const mintEntered =
      formState.mintA in mintCache && formState.mintB in mintCache;
    const sizeA = getSize(formState.sizeA, formState.mintA, mintCache);
    const sizeB = getSize(formState.sizeB, formState.mintB, mintCache);
    let isConnected = true;
    if (
      !mintEntered ||
      sizeA <= 0 ||
      sizeB <= 0 ||
      isNaN(sizeA) ||
      isNaN(sizeB)
    ) {
      isConnected = false;
    }
    const buyerAccount: any = buyerAccountState;

    const hasSufficientTokenBalance =
      buyerAccount &&
      "amount" in buyerAccount &&
      isConnected &&
      buyerAccount.amount.toNumber() >= sizeB;

    const hasSufficientLamports =
      buyerLamports >= parseFloat(formState.sizeB) * LAMPORTS_PER_SOL;
    const isNativeSOL = formState.mintB === NATIVE_MINT.toBase58();

    const hasSufficientBalance = !isNativeSOL
      ? hasSufficientTokenBalance
      : hasSufficientLamports;

    const canTrade =
      !isSeller && hasValidDelegate && validAmount && hasSufficientBalance;
    const canOpenOffer =
      isSeller && validAmount && !hasValidDelegate && isConnected;
    const canCancelOffer = isSeller && hasDelegate && isConnected;

    if (nonATAs && nonATAs.length && nonATAs.length > 0) {
      return (
        <Button
          variant="contained"
          color="success"
          onClick={() => {
            if (formState) {
              try {
                consolidateTokenAccounts(
                  connection,
                  isSeller
                    ? new PublicKey(formState.mintA)
                    : new PublicKey(formState.mintB),
                  wallet,
                  nonATAs,
                  setNonATAs
                );
              } catch (e) {
                return;
              }
            }
          }}
          sx={{ marginRight: "4px" }}
        >
          Consolidate Token Accounts
        </Button>
      );
    }
    return (
      <div>
      { (!isSeller && hasValidDelegate && validAmount && !hasSufficientBalance) && <div
        style={{
          marginLeft: "12px",
          marginBottom: "5px",
          fontSize: 12,
          textAlign: "left",
          color: "red",
        }}
      >
        {`* Buyer has insufficient funds`}
        </div>
      }
      <div>
        <Button
          variant="contained"
          disabled={!canOpenOffer}
          onClick={() => {
            if (formState) {
              try {
                changeOffer(
                  connection,
                  new PublicKey(formState.mintA),
                  new PublicKey(formState.mintB),
                  new BN(sizeA),
                  new BN(sizeB),
                  wallet,
                  setHasValidDelegate,
                  setHasDelegate,
                  metadata
                );
              } catch (e) {
                return;
              }
            }
          }}
        >
          Open New Offer
        </Button>
        <Button
          variant="contained"
          color="error"
          sx={{ marginLeft: "10px" }}
          disabled={!canCancelOffer}
          onClick={() => {
            if (formState) {
              try {
                changeOffer(
                  connection,
                  new PublicKey(formState.mintA),
                  new PublicKey(formState.mintB),
                  new BN(getSize(formState.sizeA, formState.mintA, mintCache)),
                  new BN(getSize(formState.sizeB, formState.mintB, mintCache)),
                  wallet,
                  setHasValidDelegate,
                  setHasDelegate,
                  metadata,
                  false
                );
              } catch (e) {
                return;
              }
            }
          }}
        >
          Close Existing Offer
        </Button>
        <Button
          variant="contained"
          color="success"
          sx={{ marginLeft: "10px" }}
          disabled={!canTrade}
          onClick={() => {
            if (formState) {
              try {
                trade(
                  connection,
                  new PublicKey(formState.maker),
                  new PublicKey(formState.mintA),
                  new PublicKey(formState.mintB),
                  new BN(getSize(formState.sizeA, formState.mintA, mintCache)),
                  new BN(getSize(formState.sizeB, formState.mintB, mintCache)),
                  metadata,
                  setHasValidDelegate,
                  wallet
                );
              } catch (e) {
                return;
              }
            }
          }}
        >
          Trade
        </Button>
      </div>
      </div>
    );
  };

  return (
    <div>
      <div>
        <Box
          component="form"
          sx={{
            "& .MuiTextField-root": { m: 1, width: "60ch" },
            justifyContent: "center",
            marginBottom: "10px",
          }}
          noValidate
          autoComplete="on"
        >
          <LoadingButton
            onClick={() => {
              const w = getExplorerLink(env, formState, "mintA");
              if (w) {
                w.focus();
              }
            }}
            onMouseOver={handlePopoverOpenA}
            onMouseOut={handlePopoverCloseA}
            disabled={!(formState.mintA && formState.mintA in mintCache)}
            color="secondary"
            sx={{ width: "30ch" }}
            variant="contained"
            aria-owns={openPopA ? "mouse-popoverA" : undefined}
            aria-haspopup="true"
          >
            Seller Mint (Explorer)
          </LoadingButton>
          <Popover
            id="mouse-popoverA"
            sx={{
              pointerEvents: "none",
            }}
            open={openPopA}
            anchorEl={anchorElA}
            anchorOrigin={{
              vertical: "top",
              horizontal: "left",
            }}
            transformOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
            onClose={handlePopoverCloseA}
          >
            <object
              data={`https://explorer.solana.com/address/${formState["mintA"]}/?cluster=${env}`}
              width="500"
              height="500"
            ></object>
          </Popover>
          <LoadingButton
            onClick={() => {
              const w = getExplorerLink(env, formState, "mintB");
              if (w) {
                w.focus();
              }
            }}
            onMouseOver={handlePopoverOpenB}
            onMouseOut={handlePopoverCloseB}
            disabled={!(formState.mintB && formState.mintB in mintCache)}
            color="secondary"
            sx={{ width: "30ch", marginLeft: "10px" }}
            variant="contained"
            aria-owns={openPopB ? "mouse-popoverB" : undefined}
            aria-haspopup="true"
          >
            Buyer Mint (Explorer)
          </LoadingButton>
          <Popover
            id="mouse-popoverB"
            sx={{
              pointerEvents: "none",
            }}
            open={openPopB}
            anchorEl={anchorElB}
            anchorOrigin={{
              vertical: "top",
              horizontal: "left",
            }}
            transformOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
            onClose={handlePopoverCloseB}
          >
            <object
              data={`https://explorer.solana.com/address/${formState["mintB"]}/?cluster=${env}`}
              width="500"
              height="500"
            ></object>
          </Popover>
        </Box>
      </div>
      <div>
        <Box
          component="form"
          sx={{
            "& .MuiTextField-root": { m: 1, width: "60ch" },
          }}
          noValidate
          autoComplete="on"
        >
          <div>
            <TextField
              required
              id="outlined-required"
              label="Seller Public Key"
              value={getField("maker")}
              onChange={setField("maker")}
            />
            <FormControl sx={{ marginBottom: "5px" }}>
              <InputLabel id="seller-mint">Seller Mint</InputLabel>
              <Select
                sx={{
                  display: "inline-block",
                  textAlign: "left",
                  width: "60ch",
                }}
                labelId="seller-mint"
                value={getField("mintA")}
                input={<OutlinedInput label="Seller Mint" />}
                onChange={(e) => {
                  setField("mintA")(e);
                }}
                open={openA}
                onClose={(e) => {
                  if (inputClicked) {
                    inputClicked = false;
                  } else {
                    setOpenA(false);
                  }
                }}
                onOpen={(e) => {
                  setOpenA(true);
                  setOpenB(false);
                }}
                renderValue={(selected) => {
                  return selected;
                }}
              >
                {getTokenKeys(tokenMap, "mintA")}
              </Select>
            </FormControl>
            <FormControl sx={{ marginBottom: "5px" }}>
              <InputLabel id="buyer-mint">Buyer Mint</InputLabel>
              <Select
                sx={{
                  display: "inline-block",
                  textAlign: "left",
                  width: "60ch",
                }}
                labelId="buyer-mint"
                value={getField("mintB")}
                input={<OutlinedInput label="Buyer Mint" />}
                onChange={setField("mintB")}
                open={openB}
                onClose={(e) => {
                  if (inputClicked) {
                    inputClicked = false;
                  } else {
                    setOpenB(false);
                  }
                }}
                onOpen={(e) => {
                  setOpenA(false);
                  setOpenB(true);
                }}
                renderValue={(selected) => {
                  return selected;
                }}
              >
                {getTokenKeys(tokenMap, "mintB")}
              </Select>
            </FormControl>
            <TextField
              id="outlined-number"
              label="Seller Size"
              type="number"
              value={getField("sizeA")}
              onChange={setField("sizeA")}
              sx={{ marginBottom: "5px" }}
              InputLabelProps={{
                shrink: true,
              }}
            />
            <TextField
              id="outlined-number"
              label="Buyer Size"
              type="number"
              value={getField("sizeB")}
              onChange={setField("sizeB")}
              sx={{ marginBottom: "2px" }}
              InputLabelProps={{
                shrink: true,
              }}
            />
          </div>
          {displayFees(isSeller, formState, metadata)}
          <div style={{ marginTop: "5px" }}>{displayActions()}</div>
        </Box>
      </div>
    </div>
  );
}
