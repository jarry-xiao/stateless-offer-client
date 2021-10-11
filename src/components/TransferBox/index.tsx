import React, { useMemo, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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

const displayMakerButton = () => {};

export function TransferBox() {
  const connection = useConnection();
  const wallet = useWallet();
  const [formState, setFormState] = useState({
    mintA: "",
    mintB: "",
    sizeA: "0",
    sizeB: "0",
    maker: "",
  });
  const [accountState, setAccountState] = useState({});
  const [mintCache, setMintCache] = useState({});
  const [isSeller, setIsSeller] = useState(false);

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
        setAccountState(tokenAccount);
      }
      subId = connection.onAccountChange(sellerTokenAccount, (result) => {
        if (result) {
          console.log("Received account data");
          try {
            const tokenAccount = deserializeAccount(result.data);
            setAccountState(tokenAccount);
            console.log(accountState);
          } catch (e) {
            console.log("Failed to deserialize account", e);
          }
        }
      });
    };
    const fetchMintState = async () => {
      let mint;
      for (const mintString of [formState.mintA, formState.mintB]) {
        console.log("processing mint", mintString);
        try {
          mint = new PublicKey(mintString);
        } catch(e) {
          console.log("Invalid Pubkey");
          console.log(formState)
          continue;
        }
        if (!(mint.toBase58() in mintCache)) {
          let result = await connection.getAccountInfo(mint);
          if (result) {
            try {
              const mintData = deserializeMint(result.data)
              console.log("MINT DATA", mintData);
              setMintCache({
                ...mintCache,
                [mintString]: mintData,
              });
              console.log(mintCache);
            } catch {
              console.log("Invalid Mint");
            }
          }
        } else {
          console.log(mintCache[mintString]);
        }
      }
    };
    console.log(mintCache)
    fetchAccountState();
    fetchMintState();
    return () => {
      if (subId) connection.removeAccountChangeListener(subId);
    };
  }, [formState, wallet, setAccountState, setMintCache]);

  useEffect(() => {}, [formState]);

  const setField = (name: any) => {
    const setFieldWithName = (e) => {
      setFormState({ ...formState, [name]: e.target.value });
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
        <TextField
          required
          id="outlined-required"
          label="Buyer Mint"
          value={getField("mintB")}
          onChange={setField("mintB")}
        />
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
        {isSeller ? (
          <div>
            <Button
              variant="contained"
              onClick={() => {
                if (formState) {
                  try {
                    changeOffer(
                      connection,
                      new PublicKey(formState.mintA),
                      new PublicKey(formState.mintB),
                      new BN(parseInt(formState.sizeA)),
                      new BN(parseInt(formState.sizeB)),
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
                      new BN(parseInt(formState.sizeA)),
                      new BN(parseInt(formState.sizeB)),
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
          </div>
        ) : (
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
                      new BN(parseInt(formState.sizeA)),
                      new BN(parseInt(formState.sizeB)),
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
        )}
      </div>
    </Box>
  );
}
