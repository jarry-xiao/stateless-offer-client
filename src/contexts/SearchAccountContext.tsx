import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "./ConnectionContext";
import { Connection, PublicKey } from "@solana/web3.js";
import { SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID } from "@utils/ids";
import { relativeTimeRounding } from "moment";
import React, { useContext, useEffect, useState } from "react";
import { PROGRAM_ID } from "src/actions/accept_offer";
import { deserializeAccount } from "./AccountContext";

export const SearchAccountContext = React.createContext({});


export const SearchAccountContextProvider = ({children=null as any }) => {
  const connection = useConnection();
  const wallet = useWallet();
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(
      () => {
        const getTokenAccount = async () => {
            if (!wallet) {
                return;
            }
            if (!wallet.publicKey) {
                return;
            }
            const authority = (await PublicKey.findProgramAddress(
                [],
                PROGRAM_ID,
            ))[0];
            const tokenAccountKey = (await PublicKey.findProgramAddress(
                [],
                SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
            ))[0];
            const result = await connection.getAccountInfo(tokenAccountKey);
            if (result) {
                try {
                    const tokenAccount = deserializeAccount(result.data) 
                    if (tokenAccount.delegate.toBase58() === authority.toBase58()) {
                        setHasAuth(true);
                    }
                } catch(e) {
                    console.log("Failed to deserialize account")
                }
            }
        }        
        getTokenAccount();
      },
      [wallet, connection]
  )

  return (
    <SearchAccountContext.Provider
      value={{
          hasAuth
      }}
    >
      {children}
    </SearchAccountContext.Provider>
  );
};

export const useSearchAccount = (): any => {
  const context = useContext(SearchAccountContext);
  return context;
};


