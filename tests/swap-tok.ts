import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { SwapTok } from "../target/types/swap_tok";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { randomBytes } from 'node:crypto';
import {
  TOKEN_2022_PROGRAM_ID,
  type TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getTokenGroupMemberState,
} from "@solana/spl-token";
import { confirmTransaction, createAccountsMintsAndTokenAccounts, makeKeypairs } from "@solana-developers/helpers";
import { publicKey } from "@coral-xyz/anchor/dist/cjs/utils";
import assert from "node:assert";

// Defines which token program to use in this case we are using token 2022
const TOKEN_PROGRAM: typeof TOKEN_2022_PROGRAM_ID | typeof TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;

const ANCHOR_SLOW_TEST_THRESHOLD = 40 * 1000;

// Function to generate random big integers
const getRandomBigInteger = (size = 8) => {
  return new BN(randomBytes(size));
};

// Mocha describe block, describing test cases
describe("swap-tok", () => {
  const provider = anchor.AnchorProvider.env();  // Default provider (Wallet + connection)
  anchor.setProvider(provider);  // Configure global provider for anchor
  const program = anchor.workspace.SwapTok as Program<SwapTok>;  // Load SwapTok smart contract
  const user = (provider.wallet as anchor.Wallet).payer;
  const payer = user;

  const connection = provider.connection;
  const accounts: Record<string, PublicKey> = {
    tokenProgram: TOKEN_PROGRAM
  };

  let Ayush: anchor.web3.Keypair;
  let priyanshu: anchor.web3.Keypair;

  let tokenMintA: anchor.web3.Keypair;
  let tokenMintB: anchor.web3.Keypair;

  [Ayush, priyanshu, tokenMintA, tokenMintB] = makeKeypairs(4);

  const tokenAofferedamt = new BN(1_000_000);
  const tokenBwantedamt = new BN(1_000_000);

  before("Creates Ayush, Priyanshu, 2 token mints, and associated token accounts for both users", async () => {
    const usersMintsandTokenAccounts = await createAccountsMintsAndTokenAccounts(
      [
        [1_000_000_000, 0],  // Ayush: 1_000_000_000 of Token A and 0 token B
        [0, 1_000_000_000]   // Priyanshu: 1_000_000_000 of Token B and ) token A
      ],
      1 * LAMPORTS_PER_SOL,
      connection,
      payer
    );

    const users = usersMintsandTokenAccounts.users;
    Ayush = users[0];
    priyanshu = users[1];

    const mints = usersMintsandTokenAccounts.mints;
    tokenMintA = mints[0];
    tokenMintB = mints[1];

    const tokenAccounts = usersMintsandTokenAccounts.tokenAccounts;
    const ayushtokenaccountA = tokenAccounts[0][0];
    const ayushtokenaccountB = tokenAccounts[0][1];
    const pritokenaccountA = tokenAccounts[1][0];
    const pritokenaccountB = tokenAccounts[1][1];

    accounts.maker = Ayush.publicKey;
    accounts.taker = priyanshu.publicKey;
    accounts.tokenMintA = tokenMintA.publicKey;
    accounts.tokenMintB = tokenMintB.publicKey;
    accounts.makerTokenAccountA = ayushtokenaccountA;
    accounts.takerTokenAccountA = pritokenaccountA;
    accounts.makerTokenAccountB = ayushtokenaccountB;
    accounts.takerTokenAccountB = pritokenaccountB;
  });

  it("puts the tokens that Ayush offers into the vault when Ayush makes an offer", async () => {
    const offerID = getRandomBigInteger();

    // Compute PDA for the offer
    const offer = PublicKey.findProgramAddressSync(
      [
        Buffer.from("offer"),
        accounts.maker.toBuffer(),
        offerID.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
    console.log("Generated Offer PDA:", offer.toBase58());  // Log the generated Offer PDA

    const vault = getAssociatedTokenAddressSync(
      accounts.tokenMintA,
      offer,
      true,
      TOKEN_PROGRAM,
    );
    console.log("Generated Vault PDA:", vault.toBase58());  // Log the generated Vault PDA

    accounts.offer = offer;
    accounts.vault = vault;

    const transactionSignature = await program.methods
      .makeOffer(offerID, tokenAofferedamt, tokenBwantedamt)
      .accounts({ ...accounts })
      .signers([Ayush])
      .rpc();

    await confirmTransaction(connection, transactionSignature);

    const vaultBalanceResponse = await connection.getTokenAccountBalance(vault);
    const vaultBalance = new BN(vaultBalanceResponse.value.amount);

    assert(vaultBalance.eq(tokenAofferedamt));

    const offerAccount = await program.account.offer.fetch(offer);
    assert(offerAccount.maker.equals(Ayush.publicKey));
    assert(offerAccount.tokenMintA.equals(accounts.tokenMintA));
    assert(offerAccount.tokenMintB.equals(accounts.tokenMintB));
    assert(offerAccount.tokenBWantedAmount.eq(tokenBwantedamt));
  }).slow(ANCHOR_SLOW_TEST_THRESHOLD);

  it("puts the token from the vault into Priyanshu's account, and gives Ayush Pri's tokens when Pri takes the offer", async () => {
    console.log("Offer PDA:", accounts.offer.toBase58());
    console.log("Vault PDA:", accounts.vault.toBase58());
    console.log("Maker:", accounts.maker.toBase58());
    console.log("Taker:", accounts.taker.toBase58());

    const transactionSignature = await program.methods
      .takeOffer()
      .accounts({ ...accounts })
      .signers([priyanshu])
      .rpc();

    await confirmTransaction(connection, transactionSignature);

    const priAccountBalanceAfterResp = await connection.getTokenAccountBalance(accounts.takerTokenAccountA);
    const priAccountBalanceAfter = new BN(priAccountBalanceAfterResp.value.amount);
    assert(priAccountBalanceAfter.eq(tokenAofferedamt));

    const AyushAccountBalanceAfterResp = await connection.getTokenAccountBalance(accounts.makerTokenAccountB);
    const AyushAccountBalanceAfter = new BN(AyushAccountBalanceAfterResp.value.amount);
    assert(AyushAccountBalanceAfter.eq(tokenBwantedamt));
  }).slow(ANCHOR_SLOW_TEST_THRESHOLD);
});
