import { parsePriceFeed } from './parsePriceFeed';

// Shaped exactly like a real PriceFull file: the same tag order, the same
// BOM-prefixed root, the same two-decimal quantities.
const FEED = `﻿<Root>
  <ChainID>7290027600007</ChainID>
  <Items>
    <Item>
      <ItemCode>7290000060163</ItemCode>
      <ItemName>אטריות דקות 400 גרם</ItemName>
      <ManufactureName>אסם</ManufactureName>
      <UnitQty>גרם</UnitQty>
      <Quantity>400.00</Quantity>
      <ItemPrice>8.90</ItemPrice>
    </Item>
    <Item>
      <ItemCode>16000185517</ItemCode>
      <ItemName>פייבר 1 555 ג'</ItemName>
      <ManufactureName></ManufactureName>
      <UnitQty>קילוגרם</UnitQty>
      <Quantity>0.55</Quantity>
    </Item>
    <Item>
      <ItemCode>726529983463</ItemCode>
      <ItemName>ענבים אדומים</ItemName>
      <ManufactureName>קטיף</ManufactureName>
      <UnitQty>מטרים</UnitQty>
      <Quantity>1.00</Quantity>
    </Item>
    <Item>
      <ItemCode>140</ItemCode>
      <ItemName>קוד פנימי</ItemName>
      <UnitQty>יחידות</UnitQty>
    </Item>
  </Items>
</Root>`;

describe('parsePriceFeed', () => {
  it('keys each item on the 14-digit GTIN', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows[0].gtin).toBe('07290000060163');
  });

  it('pads a UPC-A that the feed reports without its leading zero', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows.find((r) => r.name.startsWith('פייבר'))?.gtin).toBe(
      '00016000185517',
    );
  });

  it('takes the name and manufacturer as the feed spells them', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows[0].name).toBe('אטריות דקות 400 גרם');
    expect(rows[0].brand).toBe('אסם');
  });

  it('maps the feed unit onto one the app offers', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows[0].unitType).toBe('גרם');
    expect(rows.find((r) => r.name.startsWith('פייבר'))?.unitType).toBe('ק"ג');
  });

  it('leaves the unit unset when the feed reports one the app has no place for', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows.find((r) => r.name === 'ענבים אדומים')?.unitType).toBeNull();
  });

  it('leaves the brand unset when the feed sends an empty manufacturer', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows.find((r) => r.name.startsWith('פייבר'))?.brand).toBeNull();
  });

  it('drops items whose code is not a GTIN', () => {
    // Weighed-in-store goods carry a short internal code. They are real
    // products but nothing else can ever scan them, so they are not reference
    // data.
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows.map((r) => r.name)).not.toContain('קוד פנימי');
  });

  it('records which feed each row came from', () => {
    const rows = parsePriceFeed(FEED, 'shufersal');

    expect(rows.every((r) => r.source === 'shufersal')).toBe(true);
  });

  it('returns nothing for a file with no items', () => {
    expect(parsePriceFeed('<Root><Items></Items></Root>', 'shufersal')).toEqual(
      [],
    );
  });
});
