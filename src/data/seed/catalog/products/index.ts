// All product lines of the demo catalog, in category order.
import type { CatalogLine } from '../types';
import { LINES as riceDal } from './rice-dal';
import { LINES as riceDal2 } from './rice-dal-2';
import { LINES as flour } from './flour';
import { LINES as oil } from './oil';
import { LINES as spices } from './spices';
import { LINES as spices2 } from './spices-2';
import { LINES as saltSugar } from './salt-sugar';
import { LINES as biscuits } from './biscuits';
import { LINES as snacks } from './snacks';
import { LINES as beverages } from './beverages';
import { LINES as beverages2 } from './beverages-2';
import { LINES as juice } from './juice';
import { LINES as dairy } from './dairy';
import { LINES as dairy2 } from './dairy-2';
import { LINES as frozen } from './frozen';
import { LINES as meat } from './meat';
import { LINES as fish } from './fish';
import { LINES as fish2 } from './fish-2';
import { LINES as vegetables } from './vegetables';
import { LINES as vegetables2 } from './vegetables-2';
import { LINES as fruits } from './fruits';
import { LINES as fruits2 } from './fruits-2';
import { LINES as bakery } from './bakery';
import { LINES as noodlesPasta } from './noodles-pasta';
import { LINES as cosmetics } from './cosmetics';
import { LINES as personalCare } from './personal-care';
import { LINES as personalCare2 } from './personal-care-2';
import { LINES as baby } from './baby';
import { LINES as cleaning } from './cleaning';
import { LINES as cleaning2 } from './cleaning-2';
import { LINES as homeCare } from './home-care';
import { LINES as stationery } from './stationery';
import { LINES as kitchen } from './kitchen';
import { LINES as others } from './others';
import { LINES as others2 } from './others-2';

export const PRODUCT_LINES: CatalogLine[] = [
  ...riceDal,
  ...riceDal2,
  ...flour,
  ...oil,
  ...spices,
  ...spices2,
  ...saltSugar,
  ...biscuits,
  ...snacks,
  ...beverages,
  ...beverages2,
  ...juice,
  ...dairy,
  ...dairy2,
  ...frozen,
  ...meat,
  ...fish,
  ...fish2,
  ...vegetables,
  ...vegetables2,
  ...fruits,
  ...fruits2,
  ...bakery,
  ...noodlesPasta,
  ...cosmetics,
  ...personalCare,
  ...personalCare2,
  ...baby,
  ...cleaning,
  ...cleaning2,
  ...homeCare,
  ...stationery,
  ...kitchen,
  ...others,
  ...others2,
];
