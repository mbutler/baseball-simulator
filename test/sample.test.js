import { sample } from '../src/sample'


test("outputs the working confirmation message", () => {
    expect(sample()).toBe("It works.");
})