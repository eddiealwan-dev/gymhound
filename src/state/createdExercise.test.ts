import { useCreatedExercise } from './createdExercise';

it('hands the exercise the editor just made to the picker once', () => {
  expect(useCreatedExercise.getState().take()).toBeNull();
  useCreatedExercise.getState().set('abc');
  expect(useCreatedExercise.getState().id).toBe('abc');
  expect(useCreatedExercise.getState().take()).toBe('abc');
  expect(useCreatedExercise.getState().take()).toBeNull();
});
