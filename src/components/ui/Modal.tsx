/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import React, { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import useWindowDrag from "./useWindowDrag";

function PortalImpl({
  onClose,
  children,
  title,
  closeOnClickOutside,
}: {
  children: ReactNode;
  closeOnClickOutside: boolean;
  onClose: () => void;
  title: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dragOffset, isDragging, onDragHandlePointerDown } = useWindowDrag({
    resetKey: title,
  });

  useEffect(() => {
    if (modalRef.current !== null) {
      modalRef.current.focus();
    }
  }, []);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  useEffect(() => {
    let modalOverlayElement: HTMLElement | null = null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const clickOutsideHandler = (event: MouseEvent) => {
      const target = event.target;
      if (
        modalRef.current !== null &&
        !modalRef.current.contains(target as Node) &&
        closeOnClickOutside
      ) {
        onClose();
      }
    };
    const modelElement = modalRef.current;
    if (modelElement !== null) {
      modalOverlayElement = modelElement.parentElement;
      if (modalOverlayElement !== null) {
        modalOverlayElement.addEventListener("click", clickOutsideHandler);
      }
    }

    window.addEventListener("keydown", handler);

    return () => {
      window.removeEventListener("keydown", handler);
      if (modalOverlayElement !== null) {
        modalOverlayElement?.removeEventListener("click", clickOutsideHandler);
      }
    };
  }, [closeOnClickOutside, onClose]);

  return (
    <div className="Modal__overlay fixed inset-0 z-(--z-modal) flex flex-col items-center justify-center bg-black/35 max-[720px]:p-3 shrink" role="dialog">
      <div
        className="Modal__modal win-panel relative flex min-h-[100px] min-w-[300px] max-[720px]:min-w-0 max-[720px]:w-full max-[720px]:max-h-[calc(100vh-24px)] max-[720px]:overflow-y-auto grow-0 flex-col p-[18px]"
        tabIndex={-1}
        ref={modalRef}
        style={{
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        }}
      >
        <h2
          className={`Modal__title win-titlebar -mx-[18px] -mt-[18px] mb-3 px-2.5 py-1.5 text-[13px] select-none touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onDragHandlePointerDown}
        >
          {title}
        </h2>
        <Button
          variant="bevel"
          className="Modal__closeButton absolute top-1.5 right-2 flex h-5 w-5 items-center justify-center rounded-sm text-center font-bold"
          aria-label="Close modal"
          type="button"
          onClick={onClose}
        >
          X
        </Button>
        <div className="Modal__content pt-1">{children}</div>
      </div>
    </div>
  );
}

export default function Modal({
  onClose,
  children,
  title,
  closeOnClickOutside = false,
}: {
  children: ReactNode;
  closeOnClickOutside?: boolean;
  onClose: () => void;
  title: string;
}): React.ReactElement {
  return createPortal(
    <PortalImpl
      onClose={onClose}
      title={title}
      closeOnClickOutside={closeOnClickOutside}
    >
      {children}
    </PortalImpl>,
    document.body
  );
}
