import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeHost } from "./NoticeHost";
import { dismissErrorNotice, subscribeErrorNotices, toast } from "@/lib/notice";

function clearQueue() {
  let items: { id: number }[] = [];
  const unsub = subscribeErrorNotices((i) => { items = [...i]; });
  unsub();
  items.forEach((i) => dismissErrorNotice(i.id));
}

beforeEach(() => {
  vi.useFakeTimers();
  clearQueue();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = (fn: () => void) => act(fn);

describe("Fechamento dos avisos centrais", () => {
  it("não abre aviso com X para confirmação de sucesso", () => {
    render(<NoticeHost />);
    show(() => { toast.success("Cadastro salvo"); });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("fecha sozinho o aviso informativo", () => {
    render(<NoticeHost />);
    show(() => { toast.info("Sincronização concluída"); });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mantém o erro aberto até o usuário fechar", () => {
    render(<NoticeHost />);
    show(() => { toast.error("Falha ao salvar"); });
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Falha ao salvar")).toBeInTheDocument();
  });

  it("mantém o alerta aberto até o usuário fechar", () => {
    render(<NoticeHost />);
    show(() => { toast.warning("Falta documento fiscal"); });
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Falta documento fiscal")).toBeInTheDocument();
  });

  it("remove o informativo e mantém o erro da fila", () => {
    render(<NoticeHost />);
    show(() => { toast.info("Processando"); toast.error("Deu errado"); });
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Deu errado")).toBeInTheDocument();
  });
});
