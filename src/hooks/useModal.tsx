/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import React, { useState } from "react";

import Modal from "../components/ui/Modal";

export default function useModal(): [
  React.ReactElement | null,
  (
    title: string,
    getContent: (onClose: () => void) => React.ReactElement,
    closeOnClickOutside?: boolean
  ) => void
] {
  const [modalContent, setModalContent] = useState<null | {
    closeOnClickOutside: boolean;
    getContent: (onClose: () => void) => React.ReactElement;
    title: string;
  }>(null);

  const onClose = () => {
    setModalContent(null);
  };

  const modal =
    modalContent === null ? null : (
      <Modal
        onClose={onClose}
        title={modalContent.title}
        closeOnClickOutside={modalContent.closeOnClickOutside}
      >
        {modalContent.getContent(onClose)}
      </Modal>
    );

  const showModal = (
    title: string,
    getContent: (onClose: () => void) => React.ReactElement,
    closeOnClickOutside = false
  ) => {
    setModalContent({
      closeOnClickOutside,
      getContent,
      title,
    });
  };

  return [modal, showModal];
}
