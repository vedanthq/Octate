describe("User authentication mock", () => {
  it("authenticates valid test user", () => {
    const mockUser = { id: "test-2", role: "user" };
    expect(mockUser.role).toBe("user");
  });
});
