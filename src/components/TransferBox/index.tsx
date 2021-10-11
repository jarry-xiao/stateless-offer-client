import React, { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { cache, useConnection } from "../../contexts";
import { FormControlUnstyled } from "@mui/material";
import { changeOffer, trade } from "../../actions/accept_offer";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useWallet } from "@solana/wallet-adapter-react";

const displayMakerButton = () => {
  
}

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

  useEffect(() => {}, [formState]);

  useEffect(() => {}, [formState]);

  useEffect(() => {}, [formState]);

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
      {}
      <div style={{ marginTop: "10px" }}>
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
                  false,
                );
              } catch (e) {
                return;
              }
            }
          }}
        >
          Close Offer
        </Button>
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
    </Box>
  );
}
