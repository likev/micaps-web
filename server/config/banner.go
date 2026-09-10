package config

import (
	"fmt"
	"os"
	"strings"
)

// FormatServerBanner returns a boxed ASCII/Unicode banner displaying listening addresses.
// If useColor is true, vibrant ANSI colors are applied to borders, labels, and URLs.
func FormatServerBanner(port string, ips []string, useColor bool) string {
	type colors struct {
		border   string
		title    string
		label    string
		localURL string
		netURL   string
		reset    string
	}

	var c colors
	if useColor {
		c = colors{
			border:   "\033[36m",   // Cyan
			title:    "\033[1;37m", // Bold White
			label:    "\033[90m",   // Dim Gray
			localURL: "\033[1;36m", // Bold Cyan
			netURL:   "\033[1;32m", // Bold Green
			reset:    "\033[0m",
		}
	}

	type lineItem struct {
		label string
		url   string
		color string
	}

	items := []lineItem{
		{label: "Local:  ", url: fmt.Sprintf("http://localhost:%s", port), color: c.localURL},
	}
	for _, ip := range ips {
		items = append(items, lineItem{
			label: "Network:",
			url:   fmt.Sprintf("http://%s:%s", ip, port),
			color: c.netURL,
		})
	}

	titleText := "MICAPS-Web Server Ready"
	maxContent := len(titleText) + 3
	for _, item := range items {
		lineLen := 3 + len(item.label) + 2 + len(item.url)
		if lineLen > maxContent {
			maxContent = lineLen
		}
	}

	boxWidth := maxContent + 4
	if boxWidth < 52 {
		boxWidth = 52
	}

	var sb strings.Builder

	top := fmt.Sprintf("  %s┌%s┐%s", c.border, strings.Repeat("─", boxWidth+2), c.reset)
	empty := fmt.Sprintf("  %s│%s│%s", c.border, strings.Repeat(" ", boxWidth+2), c.reset)
	bot := fmt.Sprintf("  %s└%s┘%s", c.border, strings.Repeat("─", boxWidth+2), c.reset)

	titlePad := strings.Repeat(" ", boxWidth-(len(titleText)+3))
	titleLine := fmt.Sprintf("  %s│%s   %s%s%s%s  %s│%s", c.border, c.reset, c.title, titleText, c.reset, titlePad, c.border, c.reset)

	sb.WriteString("\n")
	sb.WriteString(top)
	sb.WriteString("\n")
	sb.WriteString(empty)
	sb.WriteString("\n")
	sb.WriteString(titleLine)
	sb.WriteString("\n")
	sb.WriteString(empty)
	sb.WriteString("\n")

	for _, item := range items {
		visLen := 3 + len(item.label) + 2 + len(item.url)
		pad := strings.Repeat(" ", boxWidth-visLen)
		line := fmt.Sprintf("  %s│%s   %s%s%s  %s%s%s%s  %s│%s",
			c.border, c.reset,
			c.label, item.label, c.reset,
			item.color, item.url, c.reset,
			pad,
			c.border, c.reset,
		)
		sb.WriteString(line)
		sb.WriteString("\n")
	}

	sb.WriteString(empty)
	sb.WriteString("\n")
	sb.WriteString(bot)
	sb.WriteString("\n")

	return sb.String()
}

// PrintServerBanner prints the formatted listening banner to os.Stdout
func PrintServerBanner(port string, ips []string) {
	useColor := os.Getenv("NO_COLOR") == "" && os.Getenv("TERM") != "dumb"
	fmt.Print(FormatServerBanner(port, ips, useColor))
}
