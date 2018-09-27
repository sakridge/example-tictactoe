/**
 *
 * The TicTacToe class exported by this file is used to interact with the
 * on-chain tic-tac-toe program.
 */

import cbor from 'cbor';
import bs58 from 'bs58';
import {Account, SystemProgram, Transaction} from '@solana/web3.js';

import {sendAndConfirmTransaction} from './send-and-confirm-transaction';

export class TicTacToe {
  /**
   * @private
   */
  constructor(connection, gamePublicKey, isX, playerAccount) {
    const state = {
      inProgress: false,
      myTurn: false,
      draw: false,
      winner: false,
      board: '?',
    };

    Object.assign(
      this,
      {
        connection,
        isX,
        playerAccount,
        gamePublicKey,
        state,
      }
    );
  }

  /**
   * Base-58 encoded program id
   */
  static get programId() {
    return 'CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3';
  }

  /**
   * Creates a new game, costing playerX 1 token
   */
  static async create(connection, playerXAccount) {
    const gameAccount = new Account();
    const ttt = new TicTacToe(connection, gameAccount.publicKey, true, playerXAccount);

    // Allocate memory for the game.
    {
      const transaction = SystemProgram.createAccount(
        playerXAccount.publicKey,
        gameAccount.publicKey,
        1,
        256, // userdata space
        TicTacToe.programId,
      );
      await sendAndConfirmTransaction(connection, playerXAccount, transaction);
    }

    const userdata = cbor.encode('Init');
    {
      const transaction = new Transaction({
        fee: 0,
        keys: [gameAccount.publicKey, gameAccount.publicKey, playerXAccount.publicKey],
        programId: TicTacToe.programId,
        userdata,
      });
      await sendAndConfirmTransaction(connection, gameAccount, transaction);
    }
    return ttt;
  }

  /**
   * Join an existing game as O, X must confirm
   */
  static async join(connection, playerOAccount, gamePublicKey) {
    const ttt = new TicTacToe(connection, gamePublicKey, false, playerOAccount);

    const userdata = cbor.encode('Join');
    {
      const transaction = new Transaction({
        fee: 0,
        keys: [playerOAccount.publicKey, gamePublicKey],
        programId: TicTacToe.programId,
        userdata,
      });
      await sendAndConfirmTransaction(connection, playerOAccount, transaction);
    }
    return ttt;
  }

  /**
   * Accept a game request from O
   */
  async accept() {
    const userdata = cbor.encode('Accept');
    const transaction = new Transaction({
      fee: 0,
      keys: [this.playerAccount.publicKey, this.gamePublicKey],
      programId: TicTacToe.programId,
      userdata,
    });
    await sendAndConfirmTransaction(this.connection, this.playerAccount, transaction);
  }

  /**
   * Reject a game request from O
   */
  async reject() {
    const userdata = cbor.encode('Reject');
    const transaction = new Transaction({
      fee: 0,
      keys: [this.playerAccount.publicKey, this.gamePublicKey],
      programId: TicTacToe.programId,
      userdata,
    });
    await sendAndConfirmTransaction(this.connection, this.playerAccount, transaction);
  }

  /**
   * Attempt to make a move.
   * Once this method returns, use `updateGameState()` to fetch the result
   */
  async move(x, y) {
    const cmd = [
      'Move',
      x,
      y,
    ];
    const userdata = cbor.encode(cmd);

    const transaction = new Transaction({
      fee: 0,
      keys: [this.playerAccount.publicKey, this.gamePublicKey],
      programId: TicTacToe.programId,
      userdata,
    });
    await sendAndConfirmTransaction(this.connection, this.playerAccount, transaction, true);
  }

  /**
   * Update the `state` field with the latest state
   */
  async updateGameState() {
    const accountInfo = await this.connection.getAccountInfo(this.gamePublicKey);

    const {userdata} = accountInfo;
    const length = userdata.readUInt8(0);
    if (length + 1 >= userdata.length) {
      throw new Error(`Invalid game state`);
    }
    const rawGameState = cbor.decode(userdata.slice(1));

    // TODO: Use joi or superstruct for better input validation
    if (typeof rawGameState.game !== 'object') {
      console.log(`Invalid game state: JSON.stringify(rawGameState)`);
      throw new Error('Invalid game state');
    }

    // Map rawGameState into `this.state`
    const {game} = rawGameState;

    // Render the board
    const boardItems = game.grid.map(i => i === 'Free' ? ' ' : i);
    const board = [
      boardItems.slice(0,3).join('|'),
      '-+-+-',
      boardItems.slice(3,6).join('|'),
      '-+-+-',
      boardItems.slice(6,9).join('|'),
    ].join('\n');

    const playerX = bs58.encode(game.player_x);
    const playerO = game.player_o ? bs58.encode(game.player_o) : null;

    this.state = {
      gameState: game.state,
      inProgress: false,
      myTurn: false,
      draw: false,
      winner: false,
      playerX,
      playerO,
      board,
    };

    switch (game.state) {
    case 'WaitingForO':
      break;
    case 'ORequestPending':
      break;
    case 'XMove':
      this.state.inProgress = true;
      this.state.myTurn = this.isX;
      break;
    case 'OMove':
      this.state.inProgress = true;
      this.state.myTurn = !this.isX;
      break;
    case 'Draw':
      this.state.draw = true;
      break;
    case 'XWon':
      this.state.winner = this.isX;
      break;
    case 'OWon':
      this.state.winner = !this.isX;
      break;
    default:
      throw new Error(`Unhandled game state: ${game.state}`);
    }
  }
}

