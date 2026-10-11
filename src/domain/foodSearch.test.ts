import { searchFoods } from './foodSearch';

const foods = [{ name: 'Peanut butter' }, { name: 'Butter' }, { name: 'Butternut squash' }];
const names = (items: readonly { name: string }[], q: string) => searchFoods(items, q).map((f) => f.name);

describe('searchFoods', () => {
  it('puts names that start with the query first, then the rest, each in input order (R140)', () => {
    expect(names(foods, 'butt')).toEqual(['Butter', 'Butternut squash', 'Peanut butter']);
  });

  it('has no aliases: "pb" finds nothing', () => {
    expect(names(foods, 'pb')).toEqual([]);
  });

  it('is empty for an empty query', () => {
    expect(names(foods, '')).toEqual([]);
    expect(names(foods, '  ')).toEqual([]);
  });

  it('needs every query word to start some word of the name, ignoring case', () => {
    const items = [{ name: 'Egg, large' }, { name: 'Egg white' }, { name: 'Chicken breast, cooked' }];
    expect(names(items, 'EGG')).toEqual(['Egg, large', 'Egg white']);
    expect(names(items, 'large egg')).toEqual(['Egg, large']);
    expect(names(items, 'egg w')).toEqual(['Egg white']);
    expect(names(items, 'breast chick')).toEqual(['Chicken breast, cooked']);
    expect(names(items, 'gg')).toEqual([]);
  });

  it('matches the start of a name across punctuation', () => {
    const items = [{ name: 'Yogurt, Greek, plain' }, { name: 'Greek yogurt' }];
    expect(names(items, 'greek yog')).toEqual(['Greek yogurt', 'Yogurt, Greek, plain']);
    expect(names(items, 'yogurt greek')).toEqual(['Yogurt, Greek, plain', 'Greek yogurt']);
  });

  it('ignores accents both ways', () => {
    const items = [{ name: 'Crème fraîche' }, { name: 'Jalapeño' }];
    expect(names(items, 'creme')).toEqual(['Crème fraîche']);
    expect(names(items, 'fraiche')).toEqual(['Crème fraîche']);
    expect(names(items, 'CRÈME')).toEqual(['Crème fraîche']);
    expect(names(items, 'jalapen')).toEqual(['Jalapeño']);
  });

  it('matches whether the name and the query are composed or decomposed', () => {
    const composed = 'Crème';
    const decomposed = 'Crème';
    expect(names([{ name: decomposed }], composed)).toEqual([decomposed]);
    expect(names([{ name: composed }], decomposed)).toEqual([composed]);
  });

  it('keeps the items it was given and leaves the list alone', () => {
    const items = [{ name: 'Oats', id: 'a' }];
    const found = searchFoods(items, 'oat');
    expect(found[0]).toBe(items[0]);
    expect(items).toHaveLength(1);
  });
});
