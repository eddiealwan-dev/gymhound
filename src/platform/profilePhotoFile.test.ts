import { cropToSquare } from './profilePhotoFile';

describe('the profile photo is the middle square of the photo chosen (R566)', () => {
  it('cuts the sides of a wide photo and the top and bottom of a tall one', () => {
    expect(cropToSquare(4032, 3024)).toEqual({ originX: 504, originY: 0, width: 3024, height: 3024 });
    expect(cropToSquare(3024, 4032)).toEqual({ originX: 0, originY: 504, width: 3024, height: 3024 });
  });

  it('leaves a square photo, and one with no size, alone', () => {
    expect(cropToSquare(1080, 1080)).toBeNull();
    expect(cropToSquare(1080, 1081)).toBeNull();
    expect(cropToSquare(0, 100)).toBeNull();
  });
});
