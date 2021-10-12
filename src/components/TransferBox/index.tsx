import React, { useEffect, useState } from "react";
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
import LoadingButton from '@mui/lab/LoadingButton';
import TextField from "@mui/material/TextField";
import {
  cache,
  useConnection,
  deserializeAccount,
  deserializeMint,
  useConnectionConfig,
} from "../../contexts";
import { FormControlUnstyled } from "@mui/material";
import {
  notify,
  createAssociatedTokenAccountInstruction,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from "../../utils";
import { Schema, serialize } from "borsh";
import { TOKEN_PROGRAM_ID, Token, NATIVE_MINT } from "@solana/spl-token";
import { changeOffer, trade } from "../../actions/accept_offer";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useWallet } from "@solana/wallet-adapter-react";
import tokenlist, { ENV, TokenInfo, TokenListProvider } from "@solana/spl-token-registry";

const MINTS = [
  "None",
  "SOL",
  "USDC",
  "USDT",
  "BTC",
  "ETH",
]

const getSize = (n: any, mint: any, mintCache: any) => {
  const dec = mintCache[mint].decimals;
  const size = Math.floor(parseFloat(n) * Math.pow(10, dec));
  return size;
};

const getDelegate = async (formState: any, mintCache: any) => {
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
        new PublicKey("SAtnofysr9Uxk7m9YphxwfL5E3wyZJWUzjwA29Gw3tQ")
      )
    )[0];
  } catch {
    return null;
  }
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

const displayActions = (
  connection,
  wallet: any,
  formState: any,
  mintCache: any,
  isSeller,
  hasDelegate,
  hasValidDelegate,
  validAmount
) => {
  const mintEntered =
    formState.mintA in mintCache && formState.mintB in mintCache;
  const sizeA = getSize(formState.sizeA, formState.mintA, mintCache);
  const sizeB = getSize(formState.sizeB, formState.mintB, mintCache);
  if (!mintEntered || sizeA <= 0 || sizeB <= 0) {
    return <div></div>;
  }
  if (isSeller) {
    return (
      <div>
        {validAmount && (
          <Button
            variant="contained"
            onClick={() => {
              if (formState) {
                try {
                  changeOffer(
                    connection,
                    new PublicKey(formState.mintA),
                    new PublicKey(formState.mintB),
                    new BN(
                      sizeA
                    ),
                    new BN(
                      sizeB
                    ),
                    wallet
                  );
                } catch (e) {
                  return;
                }
              }
            }}
            sx={{ marginRight: "4px" }}
          >
            Open Offer
          </Button>
        )}
        {hasDelegate && (
          <Button
            variant="contained"
            color="error"
            sx={{ marginRight: "4px" }}
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
                    false
                  );
                } catch (e) {
                  return;
                }
              }
            }}
          >
            Close Offer
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
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);

  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map());

  useEffect(() => {
    new TokenListProvider().resolve().then(tokens => {
      let tokenList;
      if (env === "devnet") {
        tokenList = tokens.filterByChainId(ENV.Devnet).getList();
      }
      else if (env === "mainnet-beta") {
        tokenList = tokens.filterByChainId(ENV.MainnetBeta).getList();
      }
      else if (env === "testnet") {
        tokenList = tokens.filterByChainId(ENV.Testnet).getList();
      }
      setTokenMap(tokenList.reduce((map, item) => {
        map.set(item.symbol, item);
        return map;
      }, new Map()));
    });
  }, [setTokenMap, env]);

  // useEffect(() => {
  //   console.log(tokenMap)
  // }, [tokenMap, env]);

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

      const delegate = await getDelegate(formState, mintCache);
      setHasDelegate(tokenAccount.delegateOption != 0);
      if (
        tokenAccount.delegate &&
        delegate &&
        tokenAccount.delegateOption != 0 &&
        delegate.toBase58() === tokenAccount.delegate.toBase58()
      ) {
        setHasValidDelegate(true);
      } else {
        setHasValidDelegate(false);
      }
    };
    validate();
  }, [
    accountState,
    mintCache,
    formState,
  ]);

  useEffect(() => {
    let subId;
    const fetchAccountState = async () => {
      let sellerWallet;
      let sellerMint;
      try {
        sellerWallet = new PublicKey(formState.maker);
        sellerMint = new PublicKey(formState.mintA);
      } catch {
        return;
      }
      const sellerTokenAccount = (
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
        const tokenAccount = deserializeAccount(result.data);
        console.log(formState);
        console.log(tokenAccount);
        setAccountState(tokenAccount);
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
          console.log("Invalid Pubkey");
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
              console.log("Invalid Mint");
            }
          }
        }
      }
    };
    fetchMintState();
  }, [mintCache, formState.mintA, formState.mintB, connection]);

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
      setOpen(false);
      console.log(e.key)
    }
  }

  const getTokenKeys = (tokenMap) => {
    // for (const mint of MINTS) {
    //   console.log(tokenMap.get(mint))
    // }
    let keys: any[] = []
    keys.push(<Input onKeyPress={handleEnter} sx={{ marginLeft: "20px" }} value={getField("mintB")} onChange={setField("mintB")}></Input>)
    for (const mint of MINTS) {
      if (!tokenMap.get(mint)) {
        if (mint === "None") {
          keys.push(<MenuItem value="">{mint}</MenuItem>);
        }
        continue
      }
      keys.push(<MenuItem value={tokenMap.get(mint).address}>{mint}</MenuItem>
      )
    }
    return keys;
  }

  return (
    <div>
      <div>
        <Box
          component="form"
          sx={{
            "& .MuiTextField-root": { m: 1, width: "60ch" },
            justifyContent: "center",
            marginBottom: "5px",
          }}
          noValidate
          autoComplete="on"
        >
          <LoadingButton
            onClick={
              () => {
                if (env && formState && formState.mintA) {
                  let url = `https://explorer.solana.com/address/${formState.mintA}?cluster=${env}`;
                  const w = window.open(url, '_blank');
                  if (w) {
                    w.focus();
                  }
                }
              }
            } sx={{ width: "30ch" }} variant="outlined"
          >
            Seller Mint (Explorer)
          </LoadingButton>
          <LoadingButton
            onClick={
              () => {
                if (env && formState && formState.mintB) {
                  let url = `https://explorer.solana.com/address/${formState.mintB}?cluster=${env}`;
                  const w = window.open(url, '_blank');
                  if (w) {
                    w.focus();
                  }
                }
              }
            } sx={{ width: "30ch" }} variant="outlined"
          >
            Buyer Mint (Explorer)
          </LoadingButton>
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
            <TextField
              required
              id="outlined-required"
              label="Seller Mint"
              value={getField("mintA")}
              onChange={setField("mintA")}
            />
            {/* <TextField
          required
          id="outlined-required"
          label="Buyer Mint"
          value={getField("mintB")}
          onChange={setField("mintB")}
        /> */}
            <FormControl>
              <InputLabel id="buyer-mint">Buyer Mint</InputLabel>
              <Select
                sx={{ display: "inline-block", textAlign: "left", width: "60ch" }}
                labelId="buyer-mint"
                value={getField("mintB")}
                input={<OutlinedInput label="Buyer Mint" />}
                onChange={setField("mintB")}
                open={open}
                onClose={(e) => { setOpen(false) }}
                onOpen={(e) => { console.log("opening"); setOpen(true) }}
                renderValue={(selected) => { return selected; }}
              >
                {getTokenKeys(tokenMap)}
              </Select>
            </FormControl>
            <TextField
              id="outlined-number"
              label="Seller Size"
              type="number"
              value={getField("sizeA")}
              onChange={setField("sizeA")}
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
              InputLabelProps={{
                shrink: true,
              }}
            />
          </div>
          <div style={{ marginTop: "10px" }}>
            {displayActions(
              connection,
              wallet,
              formState,
              mintCache,
              isSeller,
              hasDelegate,
              hasValidDelegate,
              validAmount
            )}
          </div>
        </Box>
      </div>
    </div>
  );
}
