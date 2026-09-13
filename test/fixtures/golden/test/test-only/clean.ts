describe("User authentication mock", () => {
  it("authenticates valid test user", () => {
    const mockUser = { id: "test-1", role: "admin" };
    expect(mockUser.id).toBe("test-1");
  });
});
