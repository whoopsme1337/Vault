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

const PILL_HEX: string = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';
const MOTO_HEX: string = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';

const COLLATERAL_BPS:   u64 = 15000;
const INTEREST_APR_BPS: u64 = 500;
const BLOCKS_PER_YEAR:  u64 = 52560;
const BPS_DENOM:        u64 = 10000;

const PTR_PILL_RESERVES:  u16 = 10;
const PTR_MOTO_RESERVES:  u16 = 11;
const PTR_PILL_BORROWED:  u16 = 12;
const PTR_MOTO_BORROWED:  u16 = 13;
const PTR_PILL_DEBT_PRIN: u16 = 14;
const PTR_MOTO_DEBT_PRIN: u16 = 15;
const PTR_PILL_DEBT_BLK:  u16 = 16;
const PTR_MOTO_DEBT_BLK:  u16 = 17;
const PTR_PILL_COLL:      u16 = 18;
const PTR_MOTO_COLL:      u16 = 19;
const PTR_LEND_LOCK:      u16 = 20;

@final
export class LendingExtension extends OP_NET {

    private pillReserves:  StoredU256;
    private motoReserves:  StoredU256;
    private pillBorrowed:  StoredU256;
    private motoBorrowed:  StoredU256;
    private pillDebtPrin:  AddressMemoryMap;
    private motoDebtPrin:  AddressMemoryMap;
    private pillDebtBlk:   AddressMemoryMap;
    private motoDebtBlk:   AddressMemoryMap;
    private pillColl:      AddressMemoryMap;
    private motoColl:      AddressMemoryMap;
    private lendLock:      StoredU256;

    public constructor() {
        super();
        this.pillReserves = new StoredU256(PTR_PILL_RESERVES, EMPTY_POINTER);
        this.motoReserves = new StoredU256(PTR_MOTO_RESERVES, EMPTY_POINTER);
        this.pillBorrowed = new StoredU256(PTR_PILL_BORROWED, EMPTY_POINTER);
        this.motoBorrowed = new StoredU256(PTR_MOTO_BORROWED, EMPTY_POINTER);
        this.pillDebtPrin = new AddressMemoryMap(PTR_PILL_DEBT_PRIN);
        this.motoDebtPrin = new AddressMemoryMap(PTR_MOTO_DEBT_PRIN);
        this.pillDebtBlk  = new AddressMemoryMap(PTR_PILL_DEBT_BLK);
        this.motoDebtBlk  = new AddressMemoryMap(PTR_MOTO_DEBT_BLK);
        this.pillColl     = new AddressMemoryMap(PTR_PILL_COLL);
        this.motoColl     = new AddressMemoryMap(PTR_MOTO_COLL);
        this.lendLock     = new StoredU256(PTR_LEND_LOCK, EMPTY_POINTER);
    }

    private isPill(token: Address): bool { return token.toString() == PILL_HEX; }

    private assertSupported(token: Address): void {
        if (token.toString() != PILL_HEX && token.toString() != MOTO_HEX)
            throw new Revert('Lending: unsupported token');
    }

    private oppositeToken(token: Address): Address {
        if (this.isPill(token)) return Address.fromString(MOTO_HEX);
        return Address.fromString(PILL_HEX);
    }

    private reservesOf(token: Address): u256 {
        return this.isPill(token) ? this.pillReserves.value : this.motoReserves.value;
    }
    private setReserves(token: Address, v: u256): void {
        if (this.isPill(token)) this.pillReserves.set(v); else this.motoReserves.set(v);
    }
    private borrowedOf(token: Address): u256 {
        return this.isPill(token) ? this.pillBorrowed.value : this.motoBorrowed.value;
    }
    private setBorrowed(token: Address, v: u256): void {
        if (this.isPill(token)) this.pillBorrowed.set(v); else this.motoBorrowed.set(v);
    }

    private getMapVal(map: AddressMemoryMap, user: Address): u256 {
        if (!map.has(user)) return u256.Zero;
        return map.get(user);
    }

    private getPrincipal(user: Address, token: Address): u256 {
        return this.getMapVal(this.isPill(token) ? this.pillDebtPrin : this.motoDebtPrin, user);
    }
    private getDebtBlock(user: Address, token: Address): u256 {
        return this.getMapVal(this.isPill(token) ? this.pillDebtBlk : this.motoDebtBlk, user);
    }
    private getCollateral(user: Address, token: Address): u256 {
        return this.getMapVal(this.isPill(token) ? this.pillColl : this.motoColl, user);
    }
    private setPrincipal(user: Address, token: Address, v: u256): void {
        (this.isPill(token) ? this.pillDebtPrin : this.motoDebtPrin).set(user, v);
    }
    private setDebtBlock(user: Address, token: Address, v: u256): void {
        (this.isPill(token) ? this.pillDebtBlk : this.motoDebtBlk).set(user, v);
    }
    private setCollateral(user: Address, token: Address, v: u256): void {
        (this.isPill(token) ? this.pillColl : this.motoColl).set(user, v);
    }

    private accruedDebt(user: Address, token: Address): u256 {
        const principal = this.getPrincipal(user, token);
        if (u256.eq(principal, u256.Zero)) return u256.Zero;
        const startBlk = this.getDebtBlock(user, token);
        const currentBlk = u256.fromU64(Blockchain.block.number);
        if (u256.ge(startBlk, currentBlk)) return principal;
        const elapsed = SafeMath.sub(currentBlk, startBlk);
        const numerator = SafeMath.mul(SafeMath.mul(principal, u256.fromU64(INTEREST_APR_BPS)), elapsed);
        const denominator = u256.fromU64(BLOCKS_PER_YEAR * BPS_DENOM);
        const interest = SafeMath.div(numerator, denominator);
        return SafeMath.add(principal, interest);
    }

    private maxBorrow(collateralAmount: u256): u256 {
        return SafeMath.div(SafeMath.mul(collateralAmount, u256.fromU64(BPS_DENOM)), u256.fromU64(COLLATERAL_BPS));
    }

    private enterGuard(): void {
        if (u256.eq(this.lendLock.value, u256.One)) throw new Revert('Lending: reentrant call');
        this.lendLock.set(u256.One);
    }
    private exitGuard(): void { this.lendLock.set(u256.Zero); }

    private depositCollateral(calldata: Calldata): BytesWriter {
        const collToken = calldata.readAddress();
        const amount    = calldata.readU256();
        this.assertSupported(collToken);
        if (u256.eq(amount, u256.Zero)) throw new Revert('Lending: zero amount');
        this.enterGuard();
        const sender = Blockchain.tx.sender;
        TransferHelper.transferFrom(collToken, sender, Blockchain.contractAddress, amount);
        this.setCollateral(sender, collToken, SafeMath.add(this.getCollateral(sender, collToken), amount));
        this.setReserves(collToken, SafeMath.add(this.reservesOf(collToken), amount));
        this.exitGuard();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(amount);
        return w;
    }

    private borrow(calldata: Calldata): BytesWriter {
        const borrowToken = calldata.readAddress();
        const amount      = calldata.readU256();
        this.assertSupported(borrowToken);
        if (u256.eq(amount, u256.Zero)) throw new Revert('Lending: zero amount');
        const sender    = Blockchain.tx.sender;
        const collToken = this.oppositeToken(borrowToken);
        const coll      = this.getCollateral(sender, collToken);
        if (u256.eq(coll, u256.Zero)) throw new Revert('Lending: no collateral');
        const allowed  = this.maxBorrow(coll);
        const existing = this.accruedDebt(sender, borrowToken);
        if (u256.gt(SafeMath.add(existing, amount), allowed)) throw new Revert('Lending: undercollateralized');
        const reserves = this.reservesOf(borrowToken);
        if (u256.gt(amount, reserves)) throw new Revert('Lending: insufficient reserves');
        this.enterGuard();
        this.setPrincipal(sender, borrowToken, SafeMath.add(existing, amount));
        this.setDebtBlock(sender, borrowToken, u256.fromU64(Blockchain.block.number));
        this.setBorrowed(borrowToken, SafeMath.add(this.borrowedOf(borrowToken), amount));
        this.setReserves(borrowToken, SafeMath.sub(reserves, amount));
        TransferHelper.transfer(borrowToken, sender, amount);
        this.exitGuard();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(amount);
        return w;
    }

    private repay(calldata: Calldata): BytesWriter {
        const borrowToken = calldata.readAddress();
        let amount        = calldata.readU256();
        this.assertSupported(borrowToken);
        const sender = Blockchain.tx.sender;
        const owed   = this.accruedDebt(sender, borrowToken);
        if (u256.eq(owed, u256.Zero)) throw new Revert('Lending: no debt');
        if (u256.gt(amount, owed)) amount = owed;
        this.enterGuard();
        TransferHelper.transferFrom(borrowToken, sender, Blockchain.contractAddress, amount);
        const newDebt = SafeMath.sub(owed, amount);
        this.setPrincipal(sender, borrowToken, newDebt);
        if (u256.eq(newDebt, u256.Zero)) {
            this.setDebtBlock(sender, borrowToken, u256.Zero);
        } else {
            this.setDebtBlock(sender, borrowToken, u256.fromU64(Blockchain.block.number));
        }
        const prevBorrowed = this.borrowedOf(borrowToken);
        const sub = u256.gt(amount, prevBorrowed) ? prevBorrowed : amount;
        this.setBorrowed(borrowToken, SafeMath.sub(prevBorrowed, sub));
        this.setReserves(borrowToken, SafeMath.add(this.reservesOf(borrowToken), amount));
        this.exitGuard();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(amount);
        return w;
    }

    private withdrawCollateral(calldata: Calldata): BytesWriter {
        const collToken = calldata.readAddress();
        const amount    = calldata.readU256();
        this.assertSupported(collToken);
        const sender      = Blockchain.tx.sender;
        const borrowToken = this.oppositeToken(collToken);
        const debt        = this.accruedDebt(sender, borrowToken);
        const currentColl = this.getCollateral(sender, collToken);
        if (u256.gt(amount, currentColl)) throw new Revert('Lending: insufficient collateral');
        const remaining = SafeMath.sub(currentColl, amount);
        if (u256.gt(debt, this.maxBorrow(remaining))) throw new Revert('Lending: would breach CR');
        this.enterGuard();
        this.setCollateral(sender, collToken, remaining);
        this.setReserves(collToken, SafeMath.sub(this.reservesOf(collToken), amount));
        TransferHelper.transfer(collToken, sender, amount);
        this.exitGuard();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(amount);
        return w;
    }

    private getUserDebt(calldata: Calldata): BytesWriter {
        const user  = calldata.readAddress();
        const token = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.accruedDebt(user, token));
        return w;
    }
    private getUserCollateralView(calldata: Calldata): BytesWriter {
        const user  = calldata.readAddress();
        const token = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.getCollateral(user, token));
        return w;
    }
    private getTotalBorrowed(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.borrowedOf(token));
        return w;
    }
    private getMaxBorrow(calldata: Calldata): BytesWriter {
        const user      = calldata.readAddress();
        const collToken = calldata.readAddress();
        const w = new BytesWriter(U256_BYTE_LENGTH);
        w.writeU256(this.maxBorrow(this.getCollateral(user, collToken)));
        return w;
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('depositCollateral(address,uint256)'):
                return this.depositCollateral(calldata);
            case encodeSelector('borrow(address,uint256)'):
                return this.borrow(calldata);
            case encodeSelector('repay(address,uint256)'):
                return this.repay(calldata);
            case encodeSelector('withdrawCollateral(address,uint256)'):
                return this.withdrawCollateral(calldata);
            case encodeSelector('getUserDebt(address,address)'):
                return this.getUserDebt(calldata);
            case encodeSelector('getUserCollateral(address,address)'):
                return this.getUserCollateralView(calldata);
            case encodeSelector('getTotalBorrowed(address)'):
                return this.getTotalBorrowed(calldata);
            case encodeSelector('getMaxBorrow(address,address)'):
                return this.getMaxBorrow(calldata);
            default:
                return super.execute(method, calldata);
        }
    }
}
