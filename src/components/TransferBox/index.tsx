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
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  changeOffer,
  consolidateTokenAccounts,
  trade,
} from "../../actions/accept_offer";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { ENV, TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import Popover from "@mui/material/Popover";
import {
  STATELESS_ASK_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
} from "../../utils/";
import { decodeMetadata, Metadata, getTokenMetadata } from "../../actions/metadata";

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

const getDelegate = async (
  formState: any,
  mintCache: any,
  hasMetadata: boolean,
  metadata 
) => {
  try {
    const sizeA = getSize(formState.sizeA, formState.mintA, mintCache);
    let sizeB = getSize(formState.sizeB, formState.mintB, mintCache);
    if (hasMetadata && metadata) {
      const fee = Math.floor(
        (metadata.account.data.sellerFeeBasisPoints * sizeB) / 10000
      );
      sizeB -= fee;
    }
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
    console.log(e)
    console.log("Failed to get delegate. Metadata:", metadata)
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
  const [mintCache, setMintCache] = useState({});
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
  const [metadata, setMetadata] = useState({});
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map());

  useEffect(() => {
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
    if (!wallet) {
      return;
    }
    setIsSeller(wallet.publicKey?.toBase58() === formState.maker);
  }, [formState, wallet, setIsSeller]);

  useEffect(() => {
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
        formState.mintA in metadata,
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
    let subId;
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
  }, [formState.maker, formState.mintA, connection, setAccountState]);

  useEffect(() => {
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
  }, [mintCache, formState.mintA, formState.mintB, connection]);

  useEffect(() => {
    const getMetadata = async () => {
      if (!(formState.mintA in mintCache)) {
        return;
      }
      if (formState.mintA in metadata) {
        return;
      }
      const metadataPubkey: any = await getTokenMetadata(
        new PublicKey(formState.mintA)
      );
      for (let i = 0; i < 5; ++i) {
        const result = await connection.getAccountInfo(metadataPubkey);
        if (result) {
          try {
            const meta: any = decodeMetadata(result.data);
            setMetadata({...metadata, [formState.mintA]: {pubkey: metadataPubkey, account: meta}})
            console.log(meta)
            break;
          } catch {
            continue
          }
        }
      }
    };
    getMetadata();
  }, [
    mintCache,
    formState.mintA,
    setMetadata,
    connection,
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
        onKeyPress={handleEnter}
        inputProps={{
          sx: { marginLeft: "15px" },
          value: getField(mintStr),
          placeholder:
            "Enter the desired mint public key (or select from known mints)",
        }}
        value={getField(mintStr)}
        fullWidth
        onChange={setField(mintStr)}
        onKeyDown={(e) => e.stopPropagation()}
      ></Input>
    );
    for (const mint of MINTS) {
      if (!tokenMap.get(mint)) {
        if (mint === "None") {
          keys.push(
            <MenuItem value="" sx={{ fontStyle: "italic" }}>
              {mint}
            </MenuItem>
          );
        }
        continue;
      }
      keys.push(<MenuItem value={tokenMap.get(mint).address}>{mint}</MenuItem>);
    }
    return keys;
  };

  const displayActions = () => {
    const mintEntered =
      formState.mintA in mintCache && formState.mintB in mintCache;
    const sizeA = getSize(formState.sizeA, formState.mintA, mintCache);
    const sizeB = getSize(formState.sizeB, formState.mintB, mintCache);
    if (!mintEntered || sizeA <= 0 || sizeB <= 0 || isNaN(sizeA) || isNaN(sizeB)) {
      return <div></div>;
    }

    if (isSeller && nonATAs && nonATAs.length && nonATAs.length > 0) {
      return (
        <Button
          variant="contained"
          color="success"
          onClick={() => {
            if (formState) {
              try {
                consolidateTokenAccounts(
                  connection,
                  new PublicKey(formState.mintA),
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
    if (isSeller) {
      return (
        <div>
          {validAmount && !hasValidDelegate && (
            <Button
              variant="contained"
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
              sx={{ marginRight: "4px" }}
            >
              Open New Offer
            </Button>
          )}
          {hasDelegate && (
            <Button
              variant="contained"
              color="error"
              sx={{ marginLeft: "10px" }}
              onClick={() => {
                if (formState) {
                  try {
                    changeOffer(
                      connection,
                      new PublicKey(formState.mintA),
                      new PublicKey(formState.mintB),
                      new BN(
                        getSize(formState.sizeA, formState.mintA, mintCache)
                      ),
                      new BN(
                        getSize(formState.sizeB, formState.mintB, mintCache)
                      ),
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
          )}
        </div>
      );
    } else {
      if (hasValidDelegate && validAmount) {
        return (
          <div>
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                if (formState) {
                  try {
                    trade(
                      connection,
                      new PublicKey(formState.maker),
                      new PublicKey(formState.mintA),
                      new PublicKey(formState.mintB),
                      new BN(
                        getSize(formState.sizeA, formState.mintA, mintCache)
                      ),
                      new BN(
                        getSize(formState.sizeB, formState.mintB, mintCache)
                      ),
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
        );
      } else {
        return <div></div>;
      }
    }
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
            <object data={`https://explorer.solana.com/address/${formState["mintA"]}/?cluster=${env}`} width="500" height="500">
            </object>
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
            <object data={`https://explorer.solana.com/address/${formState["mintB"]}/?cluster=${env}`} width="500" height="500">
            </object>
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
                onChange={setField("mintA")}
                open={openA}
                onClose={(e) => {
                  setOpenA(false);
                }}
                onOpen={(e) => {
                  setOpenA(true);
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
                  setOpenB(false);
                }}
                onOpen={(e) => {
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
              sx={{ marginBottom: "5px" }}
              InputLabelProps={{
                shrink: true,
              }}
            />
          </div>
          <div style={{ marginTop: "10px" }}>{displayActions()}</div>
        </Box>
      </div>
    </div>
  );
}
