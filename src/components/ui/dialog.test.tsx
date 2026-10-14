import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

afterEach(cleanup);

describe("DialogContent scroll ownership", () => {
  it("renders content directly in the single default scroll container", () => {
    render(<Dialog open><DialogContent aria-describedby={undefined}><DialogTitle>Cadastro</DialogTitle><div data-testid="fields">Campos</div></DialogContent></Dialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("fields").parentElement).toBe(dialog);
    expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(0);
  });

  it("lets a custom body own scrolling without another scroll wrapper", () => {
    render(<Dialog open><DialogContent className="p-0 overflow-hidden" aria-describedby={undefined}><DialogTitle>Veículo</DialogTitle><div data-testid="body" className="overflow-y-auto">Campos</div></DialogContent></Dialog>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("overflow-hidden", "p-0");
    expect(dialog).not.toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("body").parentElement).toBe(dialog);
    expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
  });
});