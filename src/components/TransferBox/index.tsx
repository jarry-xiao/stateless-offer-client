import React, { useMemo, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import {
  Select,
  FormControl,
  OutlinedInput,
  InputLabel,
  MenuItem,
} from "@mui/material";
import TextField from "@mui/material/TextField";
import {
  cache,
  useConnection,
  deserializeAccount,
  deserializeMint,
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

const MINTS = { SOL: "So11111111111111111111111111111111111111112" };

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
  const sizeA = parseFloat(formState.sizeA);
  const sizeB = parseFloat(formState.sizeB);
  console.log(sizeA, sizeB)
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
  const [formState, setFormState] = useState(getDefaultFormState());
  const [accountState, setAccountState] = useState({});
  const [mintCache, setMintCache] = useState({});
  const [isSeller, setIsSeller] = useState(false);
  const [validAmount, setValidAmount] = useState(false);
  const [hasDelegate, setHasDelegate] = useState(false);
  const [hasValidDelegate, setHasValidDelegate] = useState(false);

  useEffect(() => {
    if (!wallet) {
      return;
    }
    setIsSeller(wallet.publicKey?.toBase58() === formState.maker);
  }, [formState, wallet, setIsSeller]);

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
        console.log("Received account data");
        const tokenAccount = deserializeAccount(result.data);
        console.log(tokenAccount);
        setAccountState(tokenAccount);
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
      }
      subId = connection.onAccountChange(sellerTokenAccount, async (result) => {
        if (result) {
          console.log("Received account data");
          try {
            const tokenAccount = deserializeAccount(result.data);
            setAccountState(tokenAccount);
            console.log(accountState);
            const mint = tokenAccount.mint.toBase58();
            if (mint in mintCache) {
              const dec = mintCache[mint].decimals;
              const totalAmount = tokenAccount.amount;
              try {
                const size = parseFloat(formState.sizeA);
                setValidAmount(totalAmount >= size && size > 0);
              } catch {
                console.log("Not a valid float");
              }
            }

            setHasDelegate(tokenAccount.delegateOption != 0);
            const delegate = await getDelegate(formState, mintCache);
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
          } catch (e) {
            console.log("Failed to deserialize account", e);
          }
        }
      });
    };
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
              console.log(mintCache);
            } catch {
              console.log("Invalid Mint");
            }
          }
        }
      }
    };
    fetchAccountState();
    fetchMintState();
    return () => {
      if (subId) connection.removeAccountChangeListener(subId);
    };
  }, [formState, mintCache, wallet, setAccountState, setMintCache]);

  useEffect(() => console.log(mintCache), [mintCache]);

  useEffect(() => {}, [formState]);

  const setField = (name: any) => {
    const setFieldWithName = (e) => {
      if (!e.target.value) {
        return;
      }
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

  return (
    <Box
      component="form"
      sx={{
        "& .MuiTextField-root": { m: 1, width: "50ch" },
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
            sx={{ width: "50ch" }}
            labelId="buyer-mint"
            label="Buyer Mint"
            value={getField("mintB")}
            input={<OutlinedInput label="Buyer Mint" />}
            onChange={setField("mintB")}
          >
            {Object.keys(MINTS).map((key, _) => (
              <MenuItem value={MINTS[key]}>{key}</MenuItem>
            ))}
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
  );
}
