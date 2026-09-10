//go:build windows
// +build windows

package config

import (
	"os"
	"syscall"
	"unsafe"
)

func init() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getConsoleMode := kernel32.NewProc("GetConsoleMode")
	setConsoleMode := kernel32.NewProc("SetConsoleMode")

	handle := os.Stdout.Fd()
	var mode uint32
	r, _, _ := getConsoleMode.Call(handle, uintptr(unsafe.Pointer(&mode)))
	if r != 0 {
		const enableVirtualTerminalProcessing = 0x0004
		_, _, _ = setConsoleMode.Call(handle, uintptr(mode|enableVirtualTerminalProcessing))
	}
}

