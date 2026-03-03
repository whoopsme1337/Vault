import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    AddressMemoryMap,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    OP_NET,
    Revert,
    SafeMath,
    Selector,
    StoredU256,
    TransferHelper,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';

const PILL_HEX: string = 'b09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';
const MOTO_HEX: string = 'fd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';

const PTR_PILL_ASSETS:  u16 = 0;
const PTR_PILL_SHARES:  u16 = 1;
const PTR_MOTO_ASSETS:  u16 = 2;
const PTR_MOTO_SHARES:  u16 = 3;
const PTR_PILL_USER_SH: u16 = 4;
const PTR_MOTO_USER_SH: u16 = 5;
const PTR_LOCK:         u16 = 6;

@final
export class Vault extends OP_NET {

    private pillTotalAssets: StoredU256;
    private pillTotalShares: StoredU256;
    private motoTotalAssets: StoredU256;
    private motoTotalShares: StoredU256;
    private pillUserShares:  AddressMemoryMap;
    private motoUserShares:  AddressMemoryMap;
    private lock:            StoredU256;

    public constructor() {
        super();
        this.pillTotalAssets = new StoredU256(PTR_PILL_ASSETS,  EMPTY_POINTER);
        this.pillTotalShares = new StoredU256(PTR_PILL_SHARES,  EMPTY_POINTER);
        this.motoTotalAssets = new StoredU256(PTR_MOTO_ASSETS,  EMPTY_POINTER);
        this.motoTotalShares = new StoredU256(PTR_MOTO_SHARES,  EMPTY_POINTER);
        this.pillUserShares  = new AddressMemoryMap(PTR_PILL_USER_SH);
        this.motoUserShares  = new AddressMemoryMap(PTR_MOTO_USER_SH);
        this.lock            = new StoredU256(PTR_LOCK, EMPTY_POINTER);
    }

    private isPill(token: Address): bool { return token.toString() == PILL_HEX; }

    private assertSupported(token: Address): void {
        if (token.toString() != PILL_HEX && token.toString() != MOTO_HEX)
            throw new Revert('Vault: unsupported token');
    }

    private getTotalAssets(token: Address): u256 {
        return this.isPill(token) ? this.pillTotalAssets.value : this.motoTotalAssets.value;
    }
    private getTotalSharesVal(token: Address): u256 {
        return this.isPill(token) ? this.pillTotalShares.value : this.motoTotalShares.value;
    }
    private setTotalAssets(token: Address, v: u256): void {
        if (this.isPill(token)) this.pillTotalAssets.set(v); else this.motoTotalAssets.set(v);
    }
    private setTotalShares(token: Address, v: u256): void {
        if (this.isPill(token)) this.pillTotalShares.set(v); else this.motoTotalShares.set(v);
    }

    private userSharesOf(user: Address, token: Address): u256 {
        const map = this.isPill(token) ? this.pillUserShares : this.motoUserShares;
        if (!map.has(user)) return u256.Zero;
        return map.get(user);
    }
    private setUserShares(user: Address, token: Address, v: u256): void {
        const map = this.isPill(token) ? this.pillUserShares : this.motoUserShares;
        map.set(user, v);
    }

    private enterGuard(): void {
        if (u256.eq(this.lock.value, u256.One)) throw new Revert('Vault: reentrant call');
        this.lock.set(u256.One);
    }
    private exitGuard(): void { this.lock.set(u256.Zero); }

    private deposit(calldata: Calldata): BytesWriter {
        const token  = calldata.readAddress();
        const amount = calldata.readU256();
        this.assertSupported(token);
        if (u256.eq(amount, u256.Zero)) throw new Revert('Vault: zero amount');

        this.enterGuard();
        const sender = Blockchain.tx.sender;
        const ta = this.getTotalAssets(token);
        const ts = this.getTotalSharesVal(token);

        TransferHelper.transferFrom(token, sender, Blockchain.contractAddress, amount);

        let newShares: u256;
        if (u256.eq(ts, u256.Zero) || u256.eq(ta, u256.Zero)) {
            newShares = amount;
        } else {
            newShares = SafeMath.div(SafeMath.mul(amount, ts), ta);
        }

        this.setTotalAssets(token, SafeMath.add(ta, amount));
        this.setTotalShares(token, SafeMath.add(ts, newShares));
        this.setUserShares(sender, token, SafeMath.add(this.userSharesOf(sender, token), newShares));

        this.exitGuard();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(newShares);
        return w;
    }

    private withdraw(calldata: Calldata): BytesWriter {
        const token  = calldata.readAddress();
        const shares = calldata.readU256();
        this.assertSupported(token);
        if (u256.eq(shares, u256.Zero)) throw new Revert('Vault: zero shares');

        const sender = Blockchain.tx.sender;
        const owned  = this.userSharesOf(sender, token);
        if (u256.gt(shares, owned)) throw new Revert('Vault: insufficient shares');

        this.enterGuard();
        const ta = this.getTotalAssets(token);
        const ts = this.getTotalSharesVal(token);
        const assetsOut = SafeMath.div(SafeMath.mul(shares, ta), ts);

        this.setTotalShares(token, SafeMath.sub(ts, shares));
        this.setTotalAssets(token, SafeMath.sub(ta, assetsOut));
        this.setUserShares(sender, token, SafeMath.sub(owned, shares));

        TransferHelper.transfer(token, sender, assetsOut);
        this.exitGuard();

        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(assetsOut);
        return w;
    }

    private getUserSharesView(calldata: Calldata): BytesWriter {
        const user  = calldata.readAddress();
        const token = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.userSharesOf(user, token));
        return w;
    }

    private getExchangeRate(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const ta = this.getTotalAssets(token);
        const ts = this.getTotalSharesVal(token);
        const PRECISION = u256.fromU64(100_000_000);
        let rate: u256;
        if (u256.eq(ts, u256.Zero) || u256.eq(ta, u256.Zero)) {
            rate = PRECISION;
        } else {
            rate = SafeMath.div(SafeMath.mul(ts, PRECISION), ta);
        }
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(rate);
        return w;
    }

    private getTotalAssetsView(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.getTotalAssets(token));
        return w;
    }

    private getTotalSharesView(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.getTotalSharesVal(token));
        return w;
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('deposit(address,uint256)'):
                return this.deposit(calldata);
            case encodeSelector('withdraw(address,uint256)'):
                return this.withdraw(calldata);
            case encodeSelector('getUserShares(address,address)'):
                return this.getUserSharesView(calldata);
            case encodeSelector('getExchangeRate(address)'):
                return this.getExchangeRate(calldata);
            case encodeSelector('getTotalAssets(address)'):
                return this.getTotalAssetsView(calldata);
            case encodeSelector('getTotalShares(address)'):
                return this.getTotalSharesView(calldata);
            default:
                return super.execute(method, calldata);
        }
    }
}
