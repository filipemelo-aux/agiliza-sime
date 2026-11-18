import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VehicleFormModal } from "./VehicleFormModal";

vi.mock("@/components/freight/PersonSearchInput", () => ({
  PersonSearchInput: ({ onSelect }: { onSelect: (p: unknown) => void }) => <button onClick={() => onSelect({ id: "filial-to", full_name: "Sime Transporte Ltda", cnpj: "23662751000250" })}>Selecionar filial Tocantins</button>,
}));
vi.mock("@/components/fleet/VehicleAlienacaoParcelas", () => ({ VehicleAlienacaoParcelas: () => null }));
vi.mock("@/components/fleet/VehicleDocumentsTab", () => ({ VehicleDocumentsTab: () => null }));
vi.mock("@/components/PersonEditDialog", () => ({ PersonCreateDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(() => { throw new Error("Não deve inferir frota a partir do proprietário"); }) } }));

describe("proprietário independente do tipo de frota", () => {
  it("mantém Frota Própria ao selecionar a filial Tocantins", () => {
    render(<VehicleFormModal open onOpenChange={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Frota Própria" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar filial Tocantins" }));
    expect(screen.getByRole("radio", { name: "Frota Própria" })).toBeChecked();
  });
});